import type { CrearPedidoInput, MesaPublica } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { generarRefreshToken, hashToken } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { aCuenta, incluirCuenta } from '../pedidos/detalle';
import * as avisar from '../pedidos/eventos';
import {
  bloquearCuenta,
  crearPedido,
  cuentaCerrada,
  obtenerOCrearCuenta,
} from '../pedidos/pedidos.service';

const HORAS_SESION = 6;
// Ingreso con el cupo lleno: la solicitud vale unos minutos; con 3 rechazos o 5 intentos en 10
// minutos la mesa deja de aceptar gente nueva (los de la mesa la pueden desbloquear).
const MINUTOS_SOLICITUD = 3;
const MAX_RECHAZOS = 3;
const MAX_SOLICITUDES = 5;
const VENTANA_SOLICITUDES_MIN = 10;

const nuevaSesion = async (cuentaId: string) => {
  const token = generarRefreshToken();
  await prisma.sesionCliente.create({
    data: {
      cuentaId,
      tokenHash: hashToken(token),
      expiraEn: new Date(Date.now() + HORAS_SESION * 60 * 60 * 1000),
    },
  });
  return token;
};

const sesionesActivas = (cuentaId: string) =>
  prisma.sesionCliente.count({
    where: { cuentaId, revocada: false, expiraEn: { gt: new Date() } },
  });

async function mesaPorToken(tokenQr: string) {
  const mesa = await prisma.mesa.findUnique({
    where: { tokenQr },
    include: { restaurante: { select: { slug: true, nombre: true, activo: true } } },
  });
  if (!mesa || !mesa.activa || !mesa.restaurante.activo) throw noExiste('Mesa');
  return mesa;
}

type Cliente = { cuentaId: string; restauranteId: string; mesaId: string };

// Abre (u obtiene) la cuenta de la mesa y entrega una sesión. Si el celular ya tiene una sesión
// válida de esa misma cuenta, se reutiliza en lugar de crear otra.
export async function abrirSesion(tokenQr: string, sesionActual?: string): Promise<MesaPublica> {
  const mesa = await mesaPorToken(tokenQr);
  const respuesta = async (cuentaId: string, token: string) => ({
    slug: mesa.restaurante.slug,
    restaurante: mesa.restaurante.nombre,
    numero: mesa.numero,
    nombre: mesa.nombre,
    cuentaId,
    token,
    personas: (
      await prisma.cuenta.findUniqueOrThrow({
        where: { id: cuentaId },
        select: { numeroComensales: true },
      })
    ).numeroComensales,
  });

  if (sesionActual) {
    const s = await prisma.sesionCliente.findUnique({
      where: { tokenHash: hashToken(sesionActual) },
      include: { cuenta: { select: { mesaId: true, estado: true } } },
    });
    const valida =
      s &&
      !s.revocada &&
      s.expiraEn > new Date() &&
      s.cuenta.mesaId === mesa.id &&
      s.cuenta.estado !== 'CERRADA';
    if (valida) return respuesta(s.cuentaId, sesionActual);
  }

  const cuenta = await obtenerOCrearCuenta(mesa.restauranteId, mesa.id);
  // Con el cupo lleno no se entra directo: hay que pedir permiso a los de la mesa.
  const { numeroComensales, ingresoBloqueado } = await prisma.cuenta.findUniqueOrThrow({
    where: { id: cuenta.id },
    select: { numeroComensales: true, ingresoBloqueado: true },
  });
  if (numeroComensales && (await sesionesActivas(cuenta.id)) >= numeroComensales)
    throw new HttpError(
      409,
      'MESA_LLENA',
      `La mesa ${mesa.numero} ya tiene una cuenta de ${numeroComensales} personas`,
      { numero: mesa.numero, personas: numeroComensales, bloqueada: ingresoBloqueado },
    );
  return respuesta(cuenta.id, await nuevaSesion(cuenta.id));
}

// El primero que escanea dice cuántos son (y cualquiera de la mesa lo puede corregir).
export async function fijarPersonas(c: Cliente, personas: number) {
  const cuenta = await prisma.cuenta.update({
    where: { id: c.cuentaId },
    data: { numeroComensales: personas },
  });
  avisar.cuentaActualizada({ ...(await ctxDe(c)) }, cuenta);
  return { personas };
}

// Pedir unirse a una mesa con el cupo lleno.
export async function solicitarIngreso(tokenQr: string) {
  const mesa = await mesaPorToken(tokenQr);
  const cuenta = await prisma.cuenta.findFirst({
    where: { mesaId: mesa.id, estado: { not: 'CERRADA' } },
    select: { id: true, ingresoBloqueado: true },
  });
  if (!cuenta) throw new HttpError(409, 'SIN_CUENTA', 'Vuelva a escanear el QR');
  const bloqueada = () =>
    new HttpError(
      423,
      'MESA_BLOQUEADA',
      'Esta mesa no acepta más personas por ahora. Pida ayuda al mesero.',
    );
  if (cuenta.ingresoBloqueado) throw bloqueada();
  const recientes = await prisma.solicitudIngreso.count({
    where: {
      cuentaId: cuenta.id,
      createdAt: { gt: new Date(Date.now() - VENTANA_SOLICITUDES_MIN * 60_000) },
    },
  });
  if (recientes >= MAX_SOLICITUDES) {
    await prisma.cuenta.update({ where: { id: cuenta.id }, data: { ingresoBloqueado: true } });
    throw bloqueada();
  }
  const clave = generarRefreshToken();
  const solicitud = await prisma.solicitudIngreso.create({
    data: {
      cuentaId: cuenta.id,
      claveHash: hashToken(clave),
      expiraEn: new Date(Date.now() + MINUTOS_SOLICITUD * 60_000),
    },
  });
  avisar.ingresoSolicitado(cuenta.id, solicitud);
  return { id: solicitud.id, clave, expiraEn: solicitud.expiraEn.toISOString() };
}

// El que pidió entrar pregunta cómo va. Si lo aceptaron recibe su sesión (una sola vez).
export async function estadoIngreso(tokenQr: string, id: string, clave: string) {
  const mesa = await mesaPorToken(tokenQr);
  const s = await prisma.solicitudIngreso.findFirst({
    where: { id, claveHash: hashToken(clave), cuenta: { mesaId: mesa.id } },
    include: { cuenta: { select: { estado: true } } },
  });
  if (!s) throw noExiste('Solicitud');
  if (s.estado === 'PENDIENTE')
    return { estado: s.expiraEn < new Date() ? ('VENCIDA' as const) : ('PENDIENTE' as const) };
  if (s.estado === 'RECHAZADA') return { estado: 'RECHAZADA' as const };
  // ACEPTADA: la sesión se entrega una vez (el filtro evita entregar dos con pedidos simultáneos).
  const { count } = await prisma.solicitudIngreso.updateMany({
    where: { id: s.id, entregada: false },
    data: { entregada: true },
  });
  if (!count || s.cuenta.estado === 'CERRADA') throw noExiste('Solicitud');
  return { estado: 'ACEPTADA' as const, token: await nuevaSesion(s.cuentaId) };
}

// Alguien de la mesa acepta o rechaza al que pide entrar.
export async function responderIngreso(c: Cliente, id: string, aceptar: boolean) {
  const { count } = await prisma.solicitudIngreso.updateMany({
    where: { id, cuentaId: c.cuentaId, estado: 'PENDIENTE', expiraEn: { gt: new Date() } },
    data: { estado: aceptar ? 'ACEPTADA' : 'RECHAZADA' },
  });
  if (!count)
    throw new HttpError(409, 'SOLICITUD_RESUELTA', 'Esa solicitud ya se respondió o venció');
  const cuenta = await prisma.cuenta.update({
    where: { id: c.cuentaId },
    data: aceptar ? { numeroComensales: { increment: 1 } } : { rechazosIngreso: { increment: 1 } },
  });
  if (!aceptar && cuenta.rechazosIngreso >= MAX_RECHAZOS)
    await prisma.cuenta.update({ where: { id: c.cuentaId }, data: { ingresoBloqueado: true } });
  avisar.ingresoResuelto(c.cuentaId, id, aceptar ? 'ACEPTADA' : 'RECHAZADA');
  avisar.cuentaActualizada(await ctxDe(c), cuenta);
  return { estado: aceptar ? 'ACEPTADA' : 'RECHAZADA' };
}

// "Llegó alguien de verdad": la mesa vuelve a aceptar solicitudes.
export async function desbloquearIngreso(c: Cliente) {
  const cuenta = await prisma.cuenta.update({
    where: { id: c.cuentaId },
    data: { ingresoBloqueado: false, rechazosIngreso: 0 },
  });
  avisar.cuentaActualizada(await ctxDe(c), cuenta);
  return { ingresoBloqueado: false };
}

export async function verCuenta({ cuentaId }: Cliente) {
  return aCuenta(
    await prisma.cuenta.findUniqueOrThrow({ where: { id: cuentaId }, include: incluirCuenta }),
  );
}

export const pedir = (c: Cliente, input: CrearPedidoInput) =>
  crearPedido({ restauranteId: c.restauranteId, cuentaId: c.cuentaId, origen: 'CLIENTE', input });

const ctxDe = async (c: Cliente) => {
  const mesa = await prisma.mesa.findUniqueOrThrow({
    where: { id: c.mesaId },
    select: { numero: true },
  });
  return {
    restauranteId: c.restauranteId,
    cuentaId: c.cuentaId,
    mesa,
    lugar: `Mesa ${mesa.numero}`,
  };
};

// Llamar al mesero: si ya hay una llamada sin atender de esta mesa, no se duplica.
const RECORDAR_LLAMADA_MS = 30_000;

export async function llamarMesero(c: Cliente) {
  const existente = await prisma.llamada.findFirst({
    where: { restauranteId: c.restauranteId, mesaId: c.mesaId, tipo: 'MESERO', atendida: false },
  });
  if (existente) {
    // Vuelve a llamar sin que la hayan atendido: se le recuerda al mesero (como mucho cada 30 s).
    // Antes se ignoraba y, si nadie marcó la anterior como atendida, la mesa nunca sonaba.
    if (Date.now() - existente.updatedAt.getTime() < RECORDAR_LLAMADA_MS) return existente;
    const otra = await prisma.llamada.update({
      where: { id: existente.id },
      data: { updatedAt: new Date() },
    });
    avisar.mesaLlamada(await ctxDe(c), otra);
    return otra;
  }
  const llamada = await prisma.llamada.create({
    data: { restauranteId: c.restauranteId, mesaId: c.mesaId, tipo: 'MESERO' },
  });
  avisar.mesaLlamada(await ctxDe(c), llamada);
  return llamada;
}

// ABIERTA → PIDIO_CUENTA y se crea una llamada tipo CUENTA.
export async function solicitarCuenta(c: Cliente) {
  const cuenta = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, c.cuentaId);
    const actual = await tx.cuenta.findUniqueOrThrow({ where: { id: c.cuentaId } });
    if (actual.estado === 'CERRADA') throw cuentaCerrada();
    if (actual.estado !== 'ABIERTA')
      throw new HttpError(409, 'TRANSICION_INVALIDA', 'La cuenta ya fue solicitada');
    await tx.llamada.create({
      data: { restauranteId: c.restauranteId, mesaId: c.mesaId, tipo: 'CUENTA' },
    });
    return tx.cuenta.update({ where: { id: c.cuentaId }, data: { estado: 'PIDIO_CUENTA' } });
  });
  avisar.cuentaSolicitada(await ctxDe(c), cuenta.updatedAt);
  return { estado: cuenta.estado };
}
