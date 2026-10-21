import bcrypt from 'bcryptjs';
import type {
  AdminRestaurantePatchInput,
  CrearRestauranteInput,
  RestauranteConfigInput,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';

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

export const actualizarPropio = (restauranteId: string, data: RestauranteConfigInput) =>
  prisma.restaurante.update({ where: { id: restauranteId }, data });
