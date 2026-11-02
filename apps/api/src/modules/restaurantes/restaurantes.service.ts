import QRCode from 'qrcode';
import { env } from '../../lib/env';
import bcrypt from 'bcryptjs';
import {
  DIAS_PRUEBA,
  estadoSuscripcion,
  type AdminRestaurantePatchInput,
  type CrearRestauranteInput,
  type HorariosInput,
  type RestauranteConfigInput,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';
import { borrarImagenes } from '../uploads/uploads.service';

// --- Superadmin ---

// Todo restaurante nuevo empieza con el mes de prueba.
export const finPrueba = () => new Date(Date.now() + DIAS_PRUEBA * 86_400_000);

export async function crear({ restaurante, dueno }: CrearRestauranteInput) {
  const passwordHash = await bcrypt.hash(dueno.password, 10);
  return prisma.restaurante.create({
    data: {
      ...restaurante,
      planVenceEn: finPrueba(),
      usuarios: {
        create: { nombre: dueno.nombre, email: dueno.email, passwordHash, rol: 'DUENO' },
      },
    },
    include: { usuarios: { select: { id: true, nombre: true, email: true, rol: true } } },
  });
}

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
  // La imagen reemplazada (logo o banner) se borra del almacenamiento.
  const viejas = (['logoUrl', 'bannerUrl'] as const)
    .filter((k) => data[k] !== undefined && data[k] !== previo[k])
    .map((k) => previo[k]);
  if (viejas.length) await borrarImagenes(restauranteId, viejas);
  return r;
}

// QR del enlace para pedir en línea (/r/:slug), para imprimir o compartir en redes.
export async function qrEnLinea(restauranteId: string) {
  const { slug } = await obtenerPropio(restauranteId);
  const url = `${env.MENU_PUBLIC_URL}/r/${slug}`;
  return { url, png: await QRCode.toBuffer(url, { type: 'png', margin: 2, width: 768 }) };
}

// Plan del restaurante para el aviso del panel del dueño (prueba, por vencer, vencido).
export async function suscripcion(restauranteId: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({
    where: { id: restauranteId },
    select: {
      activo: true,
      plan: true,
      planVenceEn: true,
      _count: { select: { pagosPlan: true } },
    },
  });
  return {
    plan: r.plan,
    venceEn: r.planVenceEn?.toISOString() ?? null,
    estado: estadoSuscripcion({ ...r, pagos: r._count.pagosPlan }),
    soporteWhatsApp: env.SOPORTE_WHATSAPP ?? null,
  };
}
