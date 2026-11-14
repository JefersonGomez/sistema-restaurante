import {
  DIAS_GRACIA,
  estadoSuscripcion,
  nuevoVencimiento,
  PLANES,
  type AdminResumen,
  type AdminRestauranteDetalle,
  type AdminRestauranteFila,
  type EstadoSuscripcion,
  type RegistrarPagoInput,
} from '@menu-qr/shared';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';
import { restablecerPassword } from '../restaurantes/usuarios.service';

const incluir = {
  usuarios: {
    where: { rol: 'DUENO' as const },
    orderBy: { createdAt: 'asc' as const },
    take: 1,
    select: { id: true, nombre: true, email: true },
  },
  _count: { select: { pagosPlan: true, usuarios: true, mesas: true, platos: true } },
} satisfies Prisma.RestauranteInclude;
type RestauranteDB = Prisma.RestauranteGetPayload<{ include: typeof incluir }>;

// Pedidos (no cancelados) de los últimos 30 días por restaurante: el "uso".
async function pedidos30d(ids: string[]) {
  const filas = await prisma.pedido.groupBy({
    by: ['restauranteId'],
    where: {
      restauranteId: { in: ids },
      estado: { not: 'CANCELADO' },
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    _count: true,
  });
  return new Map(filas.map((f) => [f.restauranteId, f._count]));
}

const aFila = (r: RestauranteDB, pedidos: Map<string, number>): AdminRestauranteFila => ({
  id: r.id,
  nombre: r.nombre,
  slug: r.slug,
  telefono: r.telefono,
  dueno: r.usuarios[0] ? { nombre: r.usuarios[0].nombre, email: r.usuarios[0].email } : null,
  plan: r.plan,
  planVenceEn: r.planVenceEn?.toISOString() ?? null,
  estado: estadoSuscripcion({ ...r, pagos: r._count.pagosPlan }),
  suspendidoPorPago: r.suspendidoPorPago,
  pedidos30d: pedidos.get(r.id) ?? 0,
  createdAt: r.createdAt.toISOString(),
});

export async function listar(filtro: { buscar?: string; estado?: EstadoSuscripcion }) {
  const b = filtro.buscar;
  const rs = await prisma.restaurante.findMany({
    where: b
      ? {
          OR: [
            { nombre: { contains: b, mode: 'insensitive' } },
            { slug: { contains: b, mode: 'insensitive' } },
            { usuarios: { some: { email: { contains: b, mode: 'insensitive' } } } },
          ],
        }
      : {},
    orderBy: { createdAt: 'desc' },
    include: incluir,
  });
  const pedidos = await pedidos30d(rs.map((r) => r.id));
  const filas = rs.map((r) => aFila(r, pedidos));
  return filtro.estado ? filas.filter((f) => f.estado === filtro.estado) : filas;
}

export async function resumen(): Promise<AdminResumen> {
  const rs = await prisma.restaurante.findMany({
    select: {
      activo: true,
      plan: true,
      planVenceEn: true,
      _count: { select: { pagosPlan: true } },
    },
  });
  const porEstado: AdminResumen['porEstado'] = {
    SUSPENDIDO: 0,
    PRUEBA: 0,
    AL_DIA: 0,
    POR_VENCER: 0,
    VENCIDO: 0,
  };
  let mensualRecurrente = 0;
  for (const r of rs) {
    const e = estadoSuscripcion({ ...r, pagos: r._count.pagosPlan });
    porEstado[e]++;
    if (e === 'AL_DIA' || e === 'POR_VENCER') mensualRecurrente += PLANES[r.plan].mensual;
  }
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const { _sum } = await prisma.pagoSuscripcion.aggregate({
    where: { createdAt: { gte: inicioMes } },
    _sum: { monto: true },
  });
  return { restaurantes: rs.length, porEstado, ingresosMes: _sum.monto ?? 0, mensualRecurrente };
}

export async function detalle(id: string): Promise<AdminRestauranteDetalle> {
  const r = await prisma.restaurante.findUnique({
    where: { id },
    include: { ...incluir, pagosPlan: { orderBy: { createdAt: 'desc' } } },
  });
  if (!r) throw noExiste('Restaurante');
  return {
    ...aFila(r, await pedidos30d([id])),
    direccion: r.direccion,
    usuarios: r._count.usuarios,
    mesas: r._count.mesas,
    platos: r._count.platos,
    pagos: r.pagosPlan.map((p) => ({
      id: p.id,
      plan: p.plan,
      meses: p.meses,
      monto: p.monto,
      metodo: p.metodo,
      referencia: p.referencia,
      desde: p.desde.toISOString(),
      hasta: p.hasta.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
  };
}

// Pago de la mensualidad: fija el plan y corre el vencimiento.
export async function registrarPago(id: string, superadminId: string, input: RegistrarPagoInput) {
  await prisma.$transaction(async (tx) => {
    // Candado de fila: dos pagos a la vez no calculan el vencimiento sobre el mismo valor.
    const [r] = await tx.$queryRaw<{ planVenceEn: Date | null }[]>`
      SELECT "planVenceEn" FROM "Restaurante" WHERE id = ${id}::uuid FOR UPDATE`;
    if (!r) throw noExiste('Restaurante');
    const ahora = new Date();
    const desde = new Date(Math.max(ahora.getTime(), r.planVenceEn?.getTime() ?? 0));
    const hasta = nuevoVencimiento(r.planVenceEn, input.meses, ahora);
    await tx.pagoSuscripcion.create({
      data: {
        restauranteId: id,
        plan: input.plan,
        meses: input.meses,
        monto: input.monto,
        metodo: input.metodo,
        referencia: input.referencia || null,
        desde,
        hasta,
        registradoPorId: superadminId,
      },
    });
    // Si estaba suspendido por no pagar, el pago lo reactiva (una suspensión a mano, no).
    const r2 = await tx.restaurante.findUniqueOrThrow({
      where: { id },
      select: { suspendidoPorPago: true },
    });
    await tx.restaurante.update({
      where: { id },
      data: {
        plan: input.plan,
        planVenceEn: hasta,
        ...(r2.suspendidoPorPago && { activo: true, suspendidoPorPago: false }),
      },
    });
  });
  return detalle(id);
}

// Suspensión automática: vencido hace más de DIAS_GRACIA → nadie entra y el menú no abre, hasta
// que se registre un pago. Corre al arrancar la API y cada hora.
export async function suspenderVencidos(ahora = new Date()) {
  const { count } = await prisma.restaurante.updateMany({
    where: {
      activo: true,
      planVenceEn: { lt: new Date(ahora.getTime() - DIAS_GRACIA * 86_400_000) },
    },
    data: { activo: false, suspendidoPorPago: true },
  });
  return count;
}

// Contraseña temporal para el dueño (se muestra una sola vez; debe cambiarla al entrar).
export async function restablecerDueno(id: string) {
  const dueno = await prisma.usuario.findFirst({
    where: { restauranteId: id, rol: 'DUENO' },
    orderBy: { createdAt: 'asc' },
  });
  if (!dueno) throw noExiste('Dueño');
  return { email: dueno.email, ...(await restablecerPassword(id, dueno.id)) };
}
