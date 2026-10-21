import type {
  ActualizarGrupoInput,
  ActualizarModificadorInput,
  GrupoInput,
  ModificadorInput,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { obtener as obtenerPlato } from './platos.service';

type Ref = { restauranteId: string; platoId: string };

async function obtenerGrupo({ restauranteId, platoId }: Ref, grupoId: string) {
  const g = await prisma.grupoModificadores.findFirst({
    where: { id: grupoId, platoId, restauranteId },
  });
  if (!g) throw noExiste('Grupo de modificadores');
  return g;
}

// Reglas de min/max sobre los valores finales (tras aplicar un update parcial).
function validarLimites(g: { obligatorio: boolean; minimo: number; maximo: number }) {
  if (g.minimo > g.maximo)
    throw new HttpError(400, 'VALIDACION', 'El mínimo no puede ser mayor que el máximo');
  if (g.obligatorio && g.minimo < 1)
    throw new HttpError(400, 'VALIDACION', 'Un grupo obligatorio necesita mínimo 1');
}

// --- Grupos ---

export async function listarGrupos(ref: Ref) {
  await obtenerPlato(ref.restauranteId, ref.platoId);
  return prisma.grupoModificadores.findMany({
    where: ref,
    orderBy: { createdAt: 'asc' },
    include: { modificadores: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function crearGrupo(ref: Ref, data: GrupoInput) {
  await obtenerPlato(ref.restauranteId, ref.platoId);
  const obligatorio = data.obligatorio ?? false;
  const minimo = data.minimo ?? (obligatorio ? 1 : 0);
  const maximo = data.maximo ?? Math.max(1, minimo);
  validarLimites({ obligatorio, minimo, maximo });
  return prisma.grupoModificadores.create({
    data: { ...data, ...ref, obligatorio, minimo, maximo },
  });
}

export async function actualizarGrupo(ref: Ref, grupoId: string, data: ActualizarGrupoInput) {
  const actual = await obtenerGrupo(ref, grupoId);
  validarLimites({ ...actual, ...data });
  return prisma.grupoModificadores.update({ where: { id: grupoId }, data });
}

export async function eliminarGrupo(ref: Ref, grupoId: string) {
  await obtenerGrupo(ref, grupoId);
  await prisma.grupoModificadores.delete({ where: { id: grupoId } });
}

// --- Modificadores ---

async function obtenerModificador(ref: Ref, grupoId: string, modificadorId: string) {
  await obtenerGrupo(ref, grupoId);
  const m = await prisma.modificador.findFirst({
    where: { id: modificadorId, grupoId, restauranteId: ref.restauranteId },
  });
  if (!m) throw noExiste('Modificador');
  return m;
}

export async function crearModificador(ref: Ref, grupoId: string, data: ModificadorInput) {
  await obtenerGrupo(ref, grupoId);
  return prisma.modificador.create({
    data: { ...data, grupoId, restauranteId: ref.restauranteId },
  });
}

export async function actualizarModificador(
  ref: Ref,
  grupoId: string,
  modificadorId: string,
  data: ActualizarModificadorInput,
) {
  await obtenerModificador(ref, grupoId, modificadorId);
  return prisma.modificador.update({ where: { id: modificadorId }, data });
}

export async function eliminarModificador(ref: Ref, grupoId: string, modificadorId: string) {
  await obtenerModificador(ref, grupoId, modificadorId);
  await prisma.modificador.delete({ where: { id: modificadorId } });
}
