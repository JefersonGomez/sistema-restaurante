import type { ResumenTurno, TurnoCajaDetalle } from '@menu-qr/shared';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { cobradoPorMetodo } from '../reportes/porMetodo';

type Turno = Prisma.TurnoCajaGetPayload<{ include: { movimientos: true } }>;
const conMovimientos = { movimientos: { orderBy: { createdAt: 'asc' } } } as const;

const cajaCerrada = () =>
  new HttpError(409, 'CAJA_CERRADA', 'No hay una caja abierta: ábrala primero');

async function nombreDe(restauranteId: string, usuarioId: string) {
  const u = await prisma.usuario.findFirst({
    where: { id: usuarioId, restauranteId },
    select: { nombre: true },
  });
  return u?.nombre ?? 'Personal';
}

// Cuentas que entran al turno: cerradas entre ini y fin; el domicilio pagado en efectivo entra
// cuando la caja recibe el efectivo del repartidor.
const delTurno = (ini: Date, fin: Date) => Prisma.sql`
  (NOT (tipo = 'DOMICILIO' AND "metodoPago" = 'EFECTIVO')
     AND "cerradaEn" >= ${ini} AND "cerradaEn" < ${fin})
  OR (tipo = 'DOMICILIO' AND "metodoPago" = 'EFECTIVO'
     AND "efectivoRecibidoEn" >= ${ini} AND "efectivoRecibidoEn" < ${fin})`;

async function calcularResumen(restauranteId: string, t: Turno, fin: Date): Promise<ResumenTurno> {
  const filtro = delTurno(t.abiertoEn, fin);
  const [metodos, [cuenta]] = await Promise.all([
    cobradoPorMetodo(restauranteId, filtro),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "Cuenta"
      WHERE "restauranteId" = ${restauranteId}::uuid AND estado = 'CERRADA'
        AND etapa IS DISTINCT FROM 'RECHAZADO' AND (${filtro})`,
  ]);
  const de = (m: string) => metodos.find((x) => x.metodo === m)?.total ?? 0;
  const suma = (tipo: 'ENTRADA' | 'SALIDA') =>
    t.movimientos.filter((m) => m.tipo === tipo).reduce((n, m) => n + m.monto, 0);
  const ventasEfectivo = de('EFECTIVO');
  const entradas = suma('ENTRADA');
  const salidas = suma('SALIDA');
  return {
    ventasEfectivo,
    ventasTarjeta: de('TARJETA'),
    ventasSinpe: de('SINPE'),
    cuentas: Number(cuenta?.n ?? 0),
    entradas,
    salidas,
    efectivoEsperado: t.fondoInicial + ventasEfectivo + entradas - salidas,
  };
}

async function aDetalle(restauranteId: string, t: Turno): Promise<TurnoCajaDetalle> {
  // Un turno cerrado muestra lo que se guardó al cerrar (no cambia después).
  const resumen: ResumenTurno = t.cerradoEn
    ? {
        ventasEfectivo: t.ventasEfectivo ?? 0,
        ventasTarjeta: t.ventasTarjeta ?? 0,
        ventasSinpe: t.ventasSinpe ?? 0,
        cuentas: t.cuentas ?? 0,
        entradas: t.entradas ?? 0,
        salidas: t.salidas ?? 0,
        efectivoEsperado: t.efectivoEsperado ?? 0,
      }
    : await calcularResumen(restauranteId, t, new Date());
  return {
    id: t.id,
    abiertoPorNombre: t.abiertoPorNombre,
    abiertoEn: t.abiertoEn.toISOString(),
    fondoInicial: t.fondoInicial,
    cerradoPorNombre: t.cerradoPorNombre,
    cerradoEn: t.cerradoEn?.toISOString() ?? null,
    efectivoContado: t.efectivoContado,
    diferencia: t.diferencia,
    nota: t.nota,
    resumen,
    movimientos: t.movimientos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: m.monto,
      motivo: m.motivo,
      usuarioNombre: m.usuarioNombre,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

const abierto = (restauranteId: string) =>
  prisma.turnoCaja.findFirst({
    where: { restauranteId, cerradoEn: null },
    include: conMovimientos,
  });

export async function turnoActual(restauranteId: string) {
  const t = await abierto(restauranteId);
  return t ? aDetalle(restauranteId, t) : null;
}

export async function abrir(restauranteId: string, usuarioId: string, fondoInicial: number) {
  if (await abierto(restauranteId))
    throw new HttpError(409, 'CAJA_YA_ABIERTA', 'La caja ya está abierta');
  try {
    const t = await prisma.turnoCaja.create({
      data: {
        restauranteId,
        abiertoPorId: usuarioId,
        abiertoPorNombre: await nombreDe(restauranteId, usuarioId),
        fondoInicial,
      },
      include: conMovimientos,
    });
    return aDetalle(restauranteId, t);
  } catch (e) {
    // Dos aperturas al mismo tiempo: el índice único deja pasar solo una.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new HttpError(409, 'CAJA_YA_ABIERTA', 'La caja ya está abierta');
    throw e;
  }
}

export async function movimiento(
  restauranteId: string,
  usuarioId: string,
  datos: { tipo: 'ENTRADA' | 'SALIDA'; monto: number; motivo: string },
) {
  const t = await abierto(restauranteId);
  if (!t) throw cajaCerrada();
  await prisma.movimientoCaja.create({
    data: {
      ...datos,
      turnoId: t.id,
      usuarioId,
      usuarioNombre: await nombreDe(restauranteId, usuarioId),
    },
  });
  return turnoActual(restauranteId);
}

export async function cerrar(
  restauranteId: string,
  usuarioId: string,
  { efectivoContado, nota }: { efectivoContado: number; nota?: string },
) {
  const t = await abierto(restauranteId);
  if (!t) throw cajaCerrada();
  const cerradoEn = new Date();
  const r = await calcularResumen(restauranteId, t, cerradoEn);
  // updateMany con cerradoEn: null → si otro lo cerró en el mismo instante, este no hace nada.
  const { count } = await prisma.turnoCaja.updateMany({
    where: { id: t.id, restauranteId, cerradoEn: null },
    data: {
      ...r,
      cerradoEn,
      cerradoPorId: usuarioId,
      cerradoPorNombre: await nombreDe(restauranteId, usuarioId),
      efectivoContado,
      diferencia: efectivoContado - r.efectivoEsperado,
      nota: nota || null,
    },
  });
  if (!count) throw cajaCerrada();
  return obtener(restauranteId, t.id);
}

export async function obtener(restauranteId: string, id: string) {
  const t = await prisma.turnoCaja.findFirst({
    where: { id, restauranteId },
    include: conMovimientos,
  });
  if (!t) throw noExiste('Turno de caja');
  return aDetalle(restauranteId, t);
}

// Últimos cierres (los más recientes primero).
export async function cierres(restauranteId: string) {
  const turnos = await prisma.turnoCaja.findMany({
    where: { restauranteId, cerradoEn: { not: null } },
    orderBy: { cerradoEn: 'desc' },
    take: 60,
    include: conMovimientos,
  });
  return Promise.all(turnos.map((t) => aDetalle(restauranteId, t)));
}
