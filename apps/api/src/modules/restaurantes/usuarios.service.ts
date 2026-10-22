import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { ActualizarUsuarioInput, CrearUsuarioInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';

const campos = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  estacionId: true,
  activo: true,
  debeCambiarPassword: true,
  ultimoAcceso: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function obtener(restauranteId: string, id: string) {
  const u = await prisma.usuario.findFirst({ where: { id, restauranteId }, select: campos });
  if (!u) throw noExiste('Usuario');
  return u;
}

// La estación asignada (cocina/bar) tiene que ser del mismo restaurante.
async function validarEstacion(restauranteId: string, estacionId?: string | null) {
  if (
    estacionId &&
    !(await prisma.estacion.findFirst({ where: { id: estacionId, restauranteId } }))
  )
    throw noExiste('Estación');
}

export const listar = (restauranteId: string) =>
  prisma.usuario.findMany({ where: { restauranteId }, select: campos, orderBy: { nombre: 'asc' } });

export async function crear(restauranteId: string, { password, ...data }: CrearUsuarioInput) {
  await validarEstacion(restauranteId, data.estacionId);
  return prisma.usuario.create({
    data: { ...data, restauranteId, passwordHash: await bcrypt.hash(password, 10) },
    select: campos,
  });
}

export async function actualizar(
  restauranteId: string,
  yoId: string,
  id: string,
  { password, ...data }: ActualizarUsuarioInput,
) {
  await obtener(restauranteId, id);
  await validarEstacion(restauranteId, data.estacionId);
  if (id === yoId && (data.activo === false || (data.rol && data.rol !== 'DUENO')))
    throw new HttpError(400, 'OPERACION_INVALIDA', 'No puede desactivarse ni quitarse el rol');

  const u = await prisma.usuario.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: campos,
  });
  // Al desactivar o cambiar la clave se cierran sus sesiones.
  if (data.activo === false || password)
    await prisma.refreshToken.updateMany({ where: { usuarioId: id }, data: { revocado: true } });
  return u;
}

// Contraseña temporal fácil de dictar (sin 0/O ni 1/l); el usuario tendrá que cambiarla al entrar.
export async function restablecerPassword(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const temporal = Array.from(randomBytes(10), (b) => letras[b % letras.length]).join('');
  await prisma.usuario.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(temporal, 10), debeCambiarPassword: true },
  });
  await prisma.refreshToken.updateMany({ where: { usuarioId: id }, data: { revocado: true } });
  return { passwordTemporal: temporal };
}

export async function eliminar(restauranteId: string, yoId: string, id: string) {
  await obtener(restauranteId, id);
  if (id === yoId) throw new HttpError(400, 'OPERACION_INVALIDA', 'No puede eliminarse a sí mismo');
  await prisma.usuario.delete({ where: { id } });
}
