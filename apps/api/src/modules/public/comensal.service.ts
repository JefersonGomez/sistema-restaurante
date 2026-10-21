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

type Cliente = { cuentaId: string; restauranteId: string; mesaId: string };

// Abre (u obtiene) la cuenta de la mesa y entrega una sesión. Si el celular ya tiene una sesión
// válida de esa misma cuenta, se reutiliza en lugar de crear otra.
export async function abrirSesion(tokenQr: string, sesionActual?: string): Promise<MesaPublica> {
  const mesa = await prisma.mesa.findUnique({
    where: { tokenQr },
    include: { restaurante: { select: { slug: true, nombre: true, activo: true } } },
  });
  if (!mesa || !mesa.activa || !mesa.restaurante.activo) throw noExiste('Mesa');
  const respuesta = (cuentaId: string, token: string) => ({
    slug: mesa.restaurante.slug,
    restaurante: mesa.restaurante.nombre,
    numero: mesa.numero,
    nombre: mesa.nombre,
    cuentaId,
    token,
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
  const token = generarRefreshToken();
  await prisma.sesionCliente.create({
    data: {
      cuentaId: cuenta.id,
      tokenHash: hashToken(token),
      expiraEn: new Date(Date.now() + HORAS_SESION * 60 * 60 * 1000),
    },
  });
  return respuesta(cuenta.id, token);
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
  return { restauranteId: c.restauranteId, cuentaId: c.cuentaId, mesa };
};

// Llamar al mesero: si ya hay una llamada sin atender de esta mesa, no se duplica.
export async function llamarMesero(c: Cliente) {
  const existente = await prisma.llamada.findFirst({
    where: { restauranteId: c.restauranteId, mesaId: c.mesaId, tipo: 'MESERO', atendida: false },
  });
  if (existente) return existente;
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
