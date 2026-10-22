import bcrypt from 'bcryptjs';
import type {
  AdminRestaurantePatchInput,
  CrearRestauranteInput,
  HorariosInput,
  RestauranteConfigInput,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';
import { borrarImagenes } from '../uploads/uploads.service';

// --- Superadmin ---

export async function crear({ restaurante, dueno }: CrearRestauranteInput) {
  const passwordHash = await bcrypt.hash(dueno.password, 10);
  return prisma.restaurante.create({
    data: {
      ...restaurante,
      usuarios: {
        create: { nombre: dueno.nombre, email: dueno.email, passwordHash, rol: 'DUENO' },
      },
    },
    include: { usuarios: { select: { id: true, nombre: true, email: true, rol: true } } },
  });
}

export const listar = () =>
  prisma.restaurante.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { usuarios: true, mesas: true, platos: true } } },
  });

export async function actualizarAdmin(id: string, data: AdminRestaurantePatchInput) {
  if (!(await prisma.restaurante.findUnique({ where: { id } }))) throw noExiste('Restaurante');
  return prisma.restaurante.update({ where: { id }, data });
}

// --- Dueño (su propio restaurante) ---

const conHorarios = {
  horarios: { orderBy: [{ diaSemana: 'asc' as const }, { abre: 'asc' as const }] },
};

export async function obtenerPropio(restauranteId: string) {
  const r = await prisma.restaurante.findUnique({
    where: { id: restauranteId },
    include: conHorarios,
  });
  if (!r) throw noExiste('Restaurante');
  return r;
}

// Reemplaza todos los turnos del restaurante.
export async function guardarHorarios(restauranteId: string, { turnos }: HorariosInput) {
  await prisma.$transaction([
    prisma.horarioRestaurante.deleteMany({ where: { restauranteId } }),
    prisma.horarioRestaurante.createMany({ data: turnos.map((t) => ({ ...t, restauranteId })) }),
  ]);
  return obtenerPropio(restauranteId);
}

export async function actualizarPropio(restauranteId: string, data: RestauranteConfigInput) {
  const previo = await obtenerPropio(restauranteId);
  // El plato de la promoción tiene que ser de este restaurante.
  if (
    data.platoDestacadoId &&
    !(await prisma.plato.findFirst({ where: { id: data.platoDestacadoId, restauranteId } }))
  )
    throw noExiste('Plato');
  const r = await prisma.restaurante.update({
    where: { id: restauranteId },
    data,
    include: conHorarios,
  });
  if (data.logoUrl !== undefined && data.logoUrl !== previo.logoUrl)
    await borrarImagenes(restauranteId, [previo.logoUrl]);
  return r;
}
