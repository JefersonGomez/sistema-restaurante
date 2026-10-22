import bcrypt from 'bcryptjs';
import type {
  AdminRestaurantePatchInput,
  CrearRestauranteInput,
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

export async function obtenerPropio(restauranteId: string) {
  const r = await prisma.restaurante.findUnique({ where: { id: restauranteId } });
  if (!r) throw noExiste('Restaurante');
  return r;
}

export async function actualizarPropio(restauranteId: string, data: RestauranteConfigInput) {
  const previo = await obtenerPropio(restauranteId);
  const r = await prisma.restaurante.update({ where: { id: restauranteId }, data });
  if (data.logoUrl !== undefined && data.logoUrl !== previo.logoUrl)
    await borrarImagenes(restauranteId, [previo.logoUrl]);
  return r;
}
