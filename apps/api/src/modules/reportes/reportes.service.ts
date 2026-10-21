import type { ReporteHoy } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';

// Costa Rica es UTC−6 todo el año (sin horario de verano).
const OFFSET_CR_MS = -6 * 60 * 60 * 1000;

// Medianoche de hoy en Costa Rica, como instante UTC.
export function inicioDeHoyCR(ahora = new Date()) {
  const local = new Date(ahora.getTime() + OFFSET_CR_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_CR_MS,
  );
}

// ponytail: agrega en memoria las filas del día; pasar a SQL (GROUP BY) si un día supera ~decenas de miles de ítems.
export async function hoy(restauranteId: string): Promise<ReporteHoy> {
  const desde = inicioDeHoyCR();
  const cuentas = await prisma.cuenta.findMany({
    where: { restauranteId, estado: 'CERRADA', cerradaEn: { gte: desde } },
    select: { total: true },
  });
  const totalVendido = cuentas.reduce((s, c) => s + c.total, 0);

  const vendidos = await prisma.pedidoItem.findMany({
    where: {
      cancelado: false,
      pedido: {
        restauranteId,
        estado: 'CONFIRMADO',
        cuenta: { estado: 'CERRADA', cerradaEn: { gte: desde } },
      },
    },
    select: { platoId: true, cantidad: true, plato: { select: { nombreEs: true } } },
  });
  const porPlato = new Map<string, { platoId: string; nombreEs: string; cantidad: number }>();
  for (const i of vendidos) {
    const fila = porPlato.get(i.platoId) ?? {
      platoId: i.platoId,
      nombreEs: i.plato.nombreEs,
      cantidad: 0,
    };
    fila.cantidad += i.cantidad;
    porPlato.set(i.platoId, fila);
  }

  // Tiempo de preparación = de EN_PREPARACION a LISTO, de los ítems que quedaron listos hoy.
  const preparados = await prisma.pedidoItem.findMany({
    where: { pedido: { restauranteId }, listoEn: { gte: desde }, enPreparacionEn: { not: null } },
    select: { enPreparacionEn: true, listoEn: true },
  });
  const segundos = preparados.map(
    (i) => (i.listoEn!.getTime() - i.enPreparacionEn!.getTime()) / 1000,
  );

  return {
    desde: desde.toISOString(),
    totalVendido,
    cuentasCerradas: cuentas.length,
    ticketPromedio: cuentas.length ? Math.round(totalVendido / cuentas.length) : 0,
    topPlatos: [...porPlato.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10),
    tiempoPromedioPreparacionSeg: segundos.length
      ? Math.round(segundos.reduce((a, b) => a + b, 0) / segundos.length)
      : null,
  };
}
