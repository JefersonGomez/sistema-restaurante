import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { CodigoDispositivoInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { firmarAccessToken, hashToken } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { desconectarDispositivo } from '../../realtime';

const CODIGO_MINUTOS = 10;
const MAX_INTENTOS_PIN = 5;
const BLOQUEO_MINUTOS = 15;
const SESION_TABLET = '12h'; // un turno; después se vuelve a poner el PIN

const campos = {
  id: true,
  nombre: true,
  estacion: { select: { id: true, nombre: true } },
  codigo: true,
  codigoExpira: true,
  vinculadoEn: true,
  ultimoUso: true,
  createdAt: true,
} as const;

// --- Dueño ---

// Vinculadas y pendientes con código vigente (las revocadas y los códigos vencidos no se muestran).
export function listar(restauranteId: string) {
  return prisma.dispositivo.findMany({
    where: {
      restauranteId,
      revocado: false,
      OR: [{ vinculadoEn: { not: null } }, { codigoExpira: { gt: new Date() } }],
    },
    select: campos,
    orderBy: { createdAt: 'desc' },
  });
}

export async function crearCodigo(
  restauranteId: string,
  { nombre, estacionId }: CodigoDispositivoInput,
) {
  if (!(await prisma.estacion.findFirst({ where: { id: estacionId, restauranteId } })))
    throw noExiste('Estación');
  // Los códigos sin usar que ya vencieron se borran para liberar números.
  await prisma.dispositivo.deleteMany({
    where: { vinculadoEn: null, codigoExpira: { lt: new Date() } },
  });
  const codigoExpira = new Date(Date.now() + CODIGO_MINUTOS * 60_000);
  for (let intento = 0; ; intento++) {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      return await prisma.dispositivo.create({
        data: { restauranteId, estacionId, nombre, codigo, codigoExpira },
        select: campos,
      });
    } catch (e) {
      // Choque con otro código vigente (único en todo el sistema): se prueba otro.
      if ((e as { code?: string }).code !== 'P2002' || intento >= 5) throw e;
    }
  }
}

export async function revocar(restauranteId: string, id: string) {
  const { count } = await prisma.dispositivo.updateMany({
    where: { id, restauranteId, revocado: false },
    data: { revocado: true, codigo: null, tokenHash: null },
  });
  if (!count) throw noExiste('Dispositivo');
  desconectarDispositivo(id);
}

export async function fijarPin(restauranteId: string, usuarioId: string, pin: string | null) {
  const { count } = await prisma.usuario.updateMany({
    where: { id: usuarioId, restauranteId, rol: { not: 'SUPERADMIN' } },
    data: {
      pinHash: pin ? await bcrypt.hash(pin, 10) : null,
      intentosPin: 0,
      pinBloqueadoHasta: null,
    },
  });
  if (!count) throw noExiste('Usuario');
}

// --- Tablet ---

// Canjea el código de 6 dígitos por el token del dispositivo (se muestra una sola vez).
export async function vincular(codigo: string) {
  const d = await prisma.dispositivo.findUnique({ where: { codigo } });
  if (!d || d.revocado || d.vinculadoEn)
    throw new HttpError(404, 'CODIGO_INVALIDO', 'El código no existe o ya se usó');
  if (!d.codigoExpira || d.codigoExpira < new Date())
    throw new HttpError(410, 'CODIGO_VENCIDO', 'El código venció; pida uno nuevo al dueño');

  const token = randomBytes(32).toString('base64url');
  // El filtro vinculadoEn:null evita que dos tablets canjeen el mismo código a la vez.
  const { count } = await prisma.dispositivo.updateMany({
    where: { id: d.id, vinculadoEn: null },
    data: {
      tokenHash: hashToken(token),
      vinculadoEn: new Date(),
      codigo: null,
      codigoExpira: null,
    },
  });
  if (!count) throw new HttpError(404, 'CODIGO_INVALIDO', 'El código no existe o ya se usó');
  return { tokenDispositivo: token, dispositivo: await infoTablet(d.id) };
}

async function dispositivoDeToken(token: string | undefined) {
  const d = token
    ? await prisma.dispositivo.findUnique({ where: { tokenHash: hashToken(token) } })
    : null;
  if (!d || d.revocado)
    throw new HttpError(401, 'DISPOSITIVO_REVOCADO', 'Esta tablet no está vinculada');
  return d;
}

// Personal de cocina que puede entrar en esta tablet: con PIN y de esta estación (o de todas).
const quienesEntran = (restauranteId: string, estacionId: string) => ({
  restauranteId,
  rol: 'COCINA' as const,
  activo: true,
  pinHash: { not: null },
  OR: [{ estacionId: null }, { estacionId }],
});

async function infoTablet(id: string) {
  const d = await prisma.dispositivo.findUniqueOrThrow({
    where: { id },
    include: {
      estacion: { select: { id: true, nombre: true } },
      restaurante: { select: { nombre: true } },
    },
  });
  const personal = await prisma.usuario.findMany({
    where: quienesEntran(d.restauranteId, d.estacionId),
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
  return {
    id: d.id,
    nombre: d.nombre,
    estacion: d.estacion,
    restaurante: d.restaurante.nombre,
    personal,
  };
}

export async function yo(token: string | undefined) {
  return infoTablet((await dispositivoDeToken(token)).id);
}

export async function entrar(token: string | undefined, usuarioId: string, pin: string) {
  const d = await dispositivoDeToken(token);
  const u = await prisma.usuario.findFirst({
    where: { id: usuarioId, ...quienesEntran(d.restauranteId, d.estacionId) },
    include: { restaurante: { select: { id: true, nombre: true, slug: true } } },
  });
  if (!u) throw noExiste('Usuario');
  if (u.pinBloqueadoHasta && u.pinBloqueadoHasta > new Date()) {
    const min = Math.ceil((u.pinBloqueadoHasta.getTime() - Date.now()) / 60_000);
    throw new HttpError(429, 'PIN_BLOQUEADO', `Demasiados intentos. Pruebe de nuevo en ${min} min`);
  }

  if (!(await bcrypt.compare(pin, u.pinHash!))) {
    // increment atómico: dos intentos simultáneos no se pisan.
    const { intentosPin } = await prisma.usuario.update({
      where: { id: u.id },
      data: { intentosPin: { increment: 1 } },
    });
    if (intentosPin >= MAX_INTENTOS_PIN) {
      await prisma.usuario.update({
        where: { id: u.id },
        data: {
          intentosPin: 0,
          pinBloqueadoHasta: new Date(Date.now() + BLOQUEO_MINUTOS * 60_000),
        },
      });
      throw new HttpError(
        429,
        'PIN_BLOQUEADO',
        `Demasiados intentos. Pruebe de nuevo en ${BLOQUEO_MINUTOS} min`,
      );
    }
    throw new HttpError(401, 'PIN_INCORRECTO', 'PIN incorrecto', {
      intentosRestantes: MAX_INTENTOS_PIN - intentosPin,
    });
  }

  const ahora = new Date();
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: u.id },
      data: { intentosPin: 0, pinBloqueadoHasta: null, ultimoAcceso: ahora },
    }),
    prisma.dispositivo.update({ where: { id: d.id }, data: { ultimoUso: ahora } }),
  ]);
  const accessToken = firmarAccessToken(
    {
      id: u.id,
      rol: u.rol,
      restauranteId: u.restauranteId,
      dispositivoId: d.id,
      estacionId: d.estacionId,
    },
    SESION_TABLET,
  );
  return {
    accessToken,
    usuario: {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      restauranteId: u.restauranteId,
      debeCambiarPassword: false, // en la tablet no se usa la contraseña
      restaurante: u.restaurante,
    },
  };
}
