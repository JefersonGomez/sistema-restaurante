import type { EstacionInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';

export async function obtener(restauranteId: string, id: string) {
  const e = await prisma.estacion.findFirst({ where: { id, restauranteId } });
  if (!e) throw noExiste('Estación');
  return e;
}

export const listar = (restauranteId: string) =>
  prisma.estacion.findMany({ where: { restauranteId }, orderBy: { nombre: 'asc' } });

export const crear = (restauranteId: string, data: EstacionInput) =>
  prisma.estacion.create({ data: { ...data, restauranteId } });

export async function actualizar(restauranteId: string, id: string, data: EstacionInput) {
  await obtener(restauranteId, id);
  return prisma.estacion.update({ where: { id }, data });
}

export async function eliminar(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  await prisma.estacion.delete({ where: { id } });
}
