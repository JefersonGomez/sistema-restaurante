import type {
  ActualizarPlatoInput,
  GuardarGruposInput,
  OrdenInput,
  PlatoInput,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { emitToRestaurant } from '../../realtime';
import { borrarImagenes } from '../uploads/uploads.service';

const conGrupos = {
  grupos: {
    orderBy: { createdAt: 'asc' },
    include: { modificadores: { orderBy: { createdAt: 'asc' } } },
  },
} as const;

// Cualquier cambio del menú hace que los celulares (y el personal) lo vuelvan a pedir.
export function avisarMenu(restauranteId: string, extra: Record<string, unknown> = {}) {
  const aviso = { ...extra, updatedAt: new Date().toISOString() };
  emitToRestaurant(restauranteId, 'todos', 'menu:actualizado', aviso);
  emitToRestaurant(restauranteId, 'comensales', 'menu:actualizado', aviso);
}

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
  const plato = await prisma.plato.create({ data: { ...data, restauranteId } });
  avisarMenu(restauranteId);
  return plato;
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
  avisarMenu(restauranteId);
  return plato;
}

export async function eliminar(restauranteId: string, id: string) {
  const previo = await obtener(restauranteId, id);
  await prisma.plato.delete({ where: { id } });
  await borrarImagenes(restauranteId, [previo.fotoUrl, previo.fotoMiniUrl]);
  avisarMenu(restauranteId);
}

export async function marcarAgotado(restauranteId: string, id: string, agotado: boolean) {
  await obtener(restauranteId, id);
  const plato = await prisma.plato.update({ where: { id }, data: { agotado } });
  avisarMenu(restauranteId, { platoId: id, agotado });
  return plato;
}

// `ids` en el orden deseado; todos tienen que ser platos del restaurante.
export async function ordenar(restauranteId: string, { ids }: OrdenInput) {
  const propios = await prisma.plato.count({ where: { restauranteId, id: { in: ids } } });
  if (propios !== ids.length)
    throw new HttpError(400, 'IDS_INVALIDOS', 'Algún plato no existe en este restaurante');
  await prisma.$transaction(
    ids.map((id, orden) => prisma.plato.update({ where: { id }, data: { orden } })),
  );
  avisarMenu(restauranteId);
  return listar(restauranteId);
}

// Copia el plato con sus modificadores. Queda inactivo para revisarlo antes de publicarlo, y sin
// foto: si compartiera los archivos, borrar la foto de uno borraría la del otro.
export async function duplicar(restauranteId: string, id: string) {
  const p = await obtener(restauranteId, id);
  const ultimo = await prisma.plato.aggregate({
    where: { restauranteId, categoriaId: p.categoriaId },
    _max: { orden: true },
  });
  return prisma.plato.create({
    data: {
      restauranteId,
      categoriaId: p.categoriaId,
      estacionId: p.estacionId,
      nombreEs: `${p.nombreEs} (copia)`,
      nombreEn: `${p.nombreEn} (copy)`,
      descripcionEs: p.descripcionEs,
      descripcionEn: p.descripcionEn,
      precio: p.precio,
      alergenos: p.alergenos,
      activo: false,
      orden: (ultimo._max.orden ?? 0) + 1,
      grupos: {
        create: p.grupos.map((g) => ({
          restauranteId,
          nombreEs: g.nombreEs,
          nombreEn: g.nombreEn,
          obligatorio: g.obligatorio,
          minimo: g.minimo,
          maximo: g.maximo,
          modificadores: {
            create: g.modificadores.map((m) => ({
              restauranteId,
              nombreEs: m.nombreEs,
              nombreEn: m.nombreEn,
              precioExtra: m.precioExtra,
            })),
          },
        })),
      },
    },
    include: conGrupos,
  });
}

// Guarda todos los grupos del plato de una vez: con id se actualiza, sin id se crea, y los que
// no vienen se borran. Los ids tienen que ser de este plato (y las opciones, de su grupo).
export async function guardarGrupos(
  restauranteId: string,
  platoId: string,
  { grupos }: GuardarGruposInput,
) {
  const plato = await obtener(restauranteId, platoId);
  const gruposActuales = new Map(plato.grupos.map((g) => [g.id, g]));
  for (const g of grupos) {
    if (g.id && !gruposActuales.has(g.id)) throw noExiste('Grupo de modificadores');
    const opciones = new Set(g.id ? gruposActuales.get(g.id)!.modificadores.map((m) => m.id) : []);
    if (g.modificadores.some((m) => m.id && !opciones.has(m.id))) throw noExiste('Modificador');
  }

  await prisma.$transaction(async (tx) => {
    const quedan = new Set(grupos.flatMap((g) => (g.id ? [g.id] : [])));
    await tx.grupoModificadores.deleteMany({
      where: { platoId, restauranteId, id: { notIn: [...quedan] } },
    });
    for (const { id, modificadores, ...datos } of grupos) {
      const grupo = id
        ? await tx.grupoModificadores.update({ where: { id }, data: datos })
        : await tx.grupoModificadores.create({ data: { ...datos, platoId, restauranteId } });
      const siguen = modificadores.flatMap((m) => (m.id ? [m.id] : []));
      await tx.modificador.deleteMany({ where: { grupoId: grupo.id, id: { notIn: siguen } } });
      for (const { id: modId, ...m } of modificadores)
        if (modId) await tx.modificador.update({ where: { id: modId }, data: m });
        else await tx.modificador.create({ data: { ...m, grupoId: grupo.id, restauranteId } });
    }
  });
  avisarMenu(restauranteId);
  return (await obtener(restauranteId, platoId)).grupos;
}
