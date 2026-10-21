import bcrypt from 'bcryptjs';
import type { ActualizarUsuarioInput, CrearUsuarioInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';

const campos = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function obtener(restauranteId: string, id: string) {
  const u = await prisma.usuario.findFirst({ where: { id, restauranteId }, select: campos });
  if (!u) throw noExiste('Usuario');
  return u;
}

export const listar = (restauranteId: string) =>
  prisma.usuario.findMany({ where: { restauranteId }, select: campos, orderBy: { nombre: 'asc' } });

export async function crear(restauranteId: string, { password, ...data }: CrearUsuarioInput) {
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

export async function eliminar(restauranteId: string, yoId: string, id: string) {
  await obtener(restauranteId, id);
  if (id === yoId) throw new HttpError(400, 'OPERACION_INVALIDA', 'No puede eliminarse a sí mismo');
  await prisma.usuario.delete({ where: { id } });
}
