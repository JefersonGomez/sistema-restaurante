import type { ActualizarCategoriaInput, CategoriaInput, OrdenInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { avisarMenu } from './platos.service';

export async function obtener(restauranteId: string, id: string) {
  const c = await prisma.categoria.findFirst({ where: { id, restauranteId } });
  if (!c) throw noExiste('Categoría');
  return c;
}

export const listar = (restauranteId: string) =>
  prisma.categoria.findMany({
    where: { restauranteId },
    orderBy: [{ orden: 'asc' }, { nombreEs: 'asc' }],
  });

export async function crear(restauranteId: string, data: CategoriaInput) {
  const c = await prisma.categoria.create({ data: { ...data, restauranteId } });
  avisarMenu(restauranteId);
  return c;
}

export async function actualizar(
  restauranteId: string,
  id: string,
  data: ActualizarCategoriaInput,
) {
  await obtener(restauranteId, id);
  const c = await prisma.categoria.update({ where: { id }, data });
  avisarMenu(restauranteId);
  return c;
}

export async function eliminar(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  await prisma.categoria.delete({ where: { id } });
  avisarMenu(restauranteId);
}

// `ids` en el orden deseado; todas deben ser del restaurante.
export async function ordenar(restauranteId: string, { ids }: OrdenInput) {
  const propias = await prisma.categoria.count({ where: { restauranteId, id: { in: ids } } });
  if (propias !== ids.length)
    throw new HttpError(400, 'IDS_INVALIDOS', 'Alguna categoría no existe en este restaurante');
  await prisma.$transaction(
    ids.map((id, orden) => prisma.categoria.update({ where: { id }, data: { orden } })),
  );
  avisarMenu(restauranteId);
  return listar(restauranteId);
}
