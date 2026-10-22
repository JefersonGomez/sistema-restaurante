import type { ActualizarPlatoInput, PlatoInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';
import { emitToRestaurant } from '../../realtime';
import { borrarImagenes } from '../uploads/uploads.service';

const conGrupos = {
  grupos: {
    orderBy: { createdAt: 'asc' },
    include: { modificadores: { orderBy: { createdAt: 'asc' } } },
  },
} as const;

export async function obtener(restauranteId: string, id: string) {
  const p = await prisma.plato.findFirst({ where: { id, restauranteId }, include: conGrupos });
  if (!p) throw noExiste('Plato');
  return p;
}

export const listar = (restauranteId: string, categoriaId?: string) =>
  prisma.plato.findMany({
    where: { restauranteId, ...(categoriaId ? { categoriaId } : {}) },
    orderBy: [{ orden: 'asc' }, { nombreEs: 'asc' }],
  });

// La categoría y la estación referenciadas tienen que ser del mismo restaurante.
async function validarReferencias(
  restauranteId: string,
  { categoriaId, estacionId }: { categoriaId?: string; estacionId?: string },
) {
  if (
    categoriaId &&
    !(await prisma.categoria.findFirst({ where: { id: categoriaId, restauranteId } }))
  )
    throw noExiste('Categoría');
  if (
    estacionId &&
    !(await prisma.estacion.findFirst({ where: { id: estacionId, restauranteId } }))
  )
    throw noExiste('Estación');
}

export async function crear(restauranteId: string, data: PlatoInput) {
  await validarReferencias(restauranteId, data);
  return prisma.plato.create({ data: { ...data, restauranteId } });
}

export async function actualizar(restauranteId: string, id: string, data: ActualizarPlatoInput) {
  const previo = await obtener(restauranteId, id);
  await validarReferencias(restauranteId, data);
  const plato = await prisma.plato.update({ where: { id }, data });
  // Foto reemplazada o quitada: se borran los archivos viejos.
  await borrarImagenes(restauranteId, [
    data.fotoUrl !== undefined && data.fotoUrl !== previo.fotoUrl ? previo.fotoUrl : null,
    data.fotoMiniUrl !== undefined && data.fotoMiniUrl !== previo.fotoMiniUrl
      ? previo.fotoMiniUrl
      : null,
  ]);
  return plato;
}

export async function eliminar(restauranteId: string, id: string) {
  const previo = await obtener(restauranteId, id);
  await prisma.plato.delete({ where: { id } });
  await borrarImagenes(restauranteId, [previo.fotoUrl, previo.fotoMiniUrl]);
}

export async function marcarAgotado(restauranteId: string, id: string, agotado: boolean) {
  await obtener(restauranteId, id);
  const plato = await prisma.plato.update({ where: { id }, data: { agotado } });
  const aviso = { platoId: id, agotado, updatedAt: plato.updatedAt.toISOString() };
  emitToRestaurant(restauranteId, 'todos', 'menu:actualizado', aviso);
  emitToRestaurant(restauranteId, 'comensales', 'menu:actualizado', aviso);
  return plato;
}
