import { MINUTOS_DEMORA, type Reporte, type ReporteHoy, type ReporteQuery } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';

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

// SUM/COUNT de Postgres llegan como bigint; los montos (céntimos) caben de sobra en un Number.
const n = (v: bigint | number | null) => Number(v ?? 0);

// Reporte de un rango de días locales del restaurante (ambos incluidos). Todo se agrega en SQL;
// a Node solo llegan filas ya resumidas. Las fechas guardadas son UTC ("timestamp" sin zona).
export async function rango(
  restauranteId: string,
  { desde, hasta }: ReporteQuery,
): Promise<Reporte> {
  const r = await prisma.restaurante.findUnique({
    where: { id: restauranteId },
    select: { zonaHoraria: true },
  });
  if (!r) throw noExiste('Restaurante');
  const tz = r.zonaHoraria;

  // Límites del rango en UTC: medianoche local de `desde` y de `hasta + 1`.
  const [limites] = await prisma.$queryRaw<{ ini: Date; fin: Date }[]>`
    SELECT ((${desde}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC' AS ini,
           ((${hasta}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC' AS fin`;
  const { ini, fin } = limites!;

  const [porDia, porHora, porMetodo, porCategoria, topPlatos, vistas, preparacion, cancelaciones] =
    await Promise.all([
      prisma.$queryRaw<{ dia: string; total: bigint; cuentas: bigint }[]>`
        SELECT to_char(d, 'YYYY-MM-DD') AS dia,
               COALESCE(SUM(c.total), 0) AS total, COUNT(c.id) AS cuentas
        FROM generate_series(${desde}::date, ${hasta}::date, interval '1 day') AS d
        LEFT JOIN "Cuenta" c
          ON c."restauranteId" = ${restauranteId}::uuid AND c.estado = 'CERRADA'
         AND c."cerradaEn" >= ${ini} AND c."cerradaEn" < ${fin}
         AND ((c."cerradaEn" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date = d::date
        GROUP BY d ORDER BY d`,
      prisma.$queryRaw<{ hora: number; total: bigint; cuentas: bigint }[]>`
        SELECT h AS hora, COALESCE(SUM(c.total), 0) AS total, COUNT(c.id) AS cuentas
        FROM generate_series(0, 23) AS h
        LEFT JOIN "Cuenta" c
          ON c."restauranteId" = ${restauranteId}::uuid AND c.estado = 'CERRADA'
         AND c."cerradaEn" >= ${ini} AND c."cerradaEn" < ${fin}
         AND extract(hour FROM (c."cerradaEn" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) = h
        GROUP BY h ORDER BY h`,
      prisma.$queryRaw<{ metodo: string; total: bigint; cuentas: bigint }[]>`
        SELECT COALESCE(c."metodoPago"::text, 'SIN_DATO') AS metodo,
               SUM(c.total) AS total, COUNT(*) AS cuentas
        FROM "Cuenta" c
        WHERE c."restauranteId" = ${restauranteId}::uuid AND c.estado = 'CERRADA'
          AND c."cerradaEn" >= ${ini} AND c."cerradaEn" < ${fin}
        GROUP BY 1 ORDER BY 2 DESC`,
      // Ítems vendidos: de pedidos confirmados y no cancelados, en cuentas cerradas del rango.
      prisma.$queryRaw<{ categoria: string; cantidad: bigint; total: bigint }[]>`
        SELECT cat."nombreEs" AS categoria, SUM(i.cantidad) AS cantidad,
               SUM(i.cantidad * i."precioUnitario") AS total
        FROM "PedidoItem" i
        JOIN "Pedido" p ON p.id = i."pedidoId"
        JOIN "Cuenta" c ON c.id = p."cuentaId"
        JOIN "Plato" pl ON pl.id = i."platoId"
        JOIN "Categoria" cat ON cat.id = pl."categoriaId"
        WHERE c."restauranteId" = ${restauranteId}::uuid AND c.estado = 'CERRADA'
          AND c."cerradaEn" >= ${ini} AND c."cerradaEn" < ${fin}
          AND p.estado = 'CONFIRMADO' AND NOT i.cancelado
        GROUP BY cat.id, cat."nombreEs" ORDER BY 3 DESC`,
      prisma.$queryRaw<{ platoId: string; nombre: string; cantidad: bigint; total: bigint }[]>`
        SELECT pl.id AS "platoId", pl."nombreEs" AS nombre, SUM(i.cantidad) AS cantidad,
               SUM(i.cantidad * i."precioUnitario") AS total
        FROM "PedidoItem" i
        JOIN "Pedido" p ON p.id = i."pedidoId"
        JOIN "Cuenta" c ON c.id = p."cuentaId"
        JOIN "Plato" pl ON pl.id = i."platoId"
        WHERE c."restauranteId" = ${restauranteId}::uuid AND c.estado = 'CERRADA'
          AND c."cerradaEn" >= ${ini} AND c."cerradaEn" < ${fin}
          AND p.estado = 'CONFIRMADO' AND NOT i.cancelado
        GROUP BY pl.id, pl."nombreEs" ORDER BY 3 DESC, 4 DESC`,
      prisma.$queryRaw<{ platoId: string; nombre: string; vistas: bigint }[]>`
        SELECT pl.id AS "platoId", pl."nombreEs" AS nombre, SUM(v.vistas) AS vistas
        FROM "VistaPlato" v JOIN "Plato" pl ON pl.id = v."platoId"
        WHERE v."restauranteId" = ${restauranteId}::uuid
          AND v.dia BETWEEN ${desde}::date AND ${hasta}::date
        GROUP BY pl.id, pl."nombreEs"`,
      // Preparación: de EN_PREPARACION a LISTO; demorado = listo más de MINUTOS_DEMORA después
      // de confirmado el pedido (lo mismo que pinta de rojo la pantalla de cocina).
      prisma.$queryRaw<
        { estacion: string; items: bigint; promedioSeg: number; demorados: bigint }[]
      >`
        SELECT e.nombre AS estacion, COUNT(*) AS items,
               ROUND(AVG(extract(epoch FROM i."listoEn" - i."enPreparacionEn")))::float8 AS "promedioSeg",
               COUNT(*) FILTER (
                 WHERE i."listoEn" - p."confirmadoEn" > make_interval(mins => ${MINUTOS_DEMORA})
               ) AS demorados
        FROM "PedidoItem" i
        JOIN "Pedido" p ON p.id = i."pedidoId"
        JOIN "Estacion" e ON e.id = i."estacionId"
        WHERE p."restauranteId" = ${restauranteId}::uuid
          AND i."listoEn" >= ${ini} AND i."listoEn" < ${fin} AND i."enPreparacionEn" IS NOT NULL
        GROUP BY e.id, e.nombre ORDER BY e.nombre`,
      prisma.$queryRaw<{ motivo: string; items: bigint }[]>`
        SELECT COALESCE(NULLIF(trim(i."motivoCancelacion"), ''), 'Sin motivo') AS motivo,
               SUM(i.cantidad) AS items
        FROM "PedidoItem" i JOIN "Pedido" p ON p.id = i."pedidoId"
        WHERE p."restauranteId" = ${restauranteId}::uuid AND i.cancelado
          AND i."updatedAt" >= ${ini} AND i."updatedAt" < ${fin}
        GROUP BY 1 ORDER BY 2 DESC`,
    ]);

  const dias = porDia.map((d) => ({ dia: d.dia, total: n(d.total), cuentas: n(d.cuentas) }));
  const totalVendido = dias.reduce((s, d) => s + d.total, 0);
  const cuentas = dias.reduce((s, d) => s + d.cuentas, 0);

  // Vistas vs. pedidos: los platos más vistos o más pedidos (unión de ambos).
  const vvp = new Map<
    string,
    { platoId: string; nombre: string; vistas: number; pedidos: number }
  >();
  for (const v of vistas)
    vvp.set(v.platoId, { platoId: v.platoId, nombre: v.nombre, vistas: n(v.vistas), pedidos: 0 });
  for (const p of topPlatos) {
    const fila = vvp.get(p.platoId) ?? {
      platoId: p.platoId,
      nombre: p.nombre,
      vistas: 0,
      pedidos: 0,
    };
    fila.pedidos = n(p.cantidad);
    vvp.set(p.platoId, fila);
  }

  return {
    desde,
    hasta,
    resumen: {
      totalVendido,
      cuentas,
      ticketPromedio: cuentas ? Math.round(totalVendido / cuentas) : 0,
    },
    porDia: dias,
    porHora: porHora.map((h) => ({ hora: n(h.hora), total: n(h.total), cuentas: n(h.cuentas) })),
    porMetodo: porMetodo.map((m) => ({
      metodo: m.metodo,
      total: n(m.total),
      cuentas: n(m.cuentas),
    })),
    porCategoria: porCategoria.map((c) => ({
      categoria: c.categoria,
      cantidad: n(c.cantidad),
      total: n(c.total),
    })),
    topPlatos: topPlatos.slice(0, 10).map((p) => ({
      platoId: p.platoId,
      nombre: p.nombre,
      cantidad: n(p.cantidad),
      total: n(p.total),
    })),
    vistasVsPedidos: [...vvp.values()]
      .sort((a, b) => b.vistas - a.vistas || b.pedidos - a.pedidos)
      .slice(0, 15),
    preparacion: preparacion.map((p) => ({
      estacion: p.estacion,
      items: n(p.items),
      promedioSeg: n(p.promedioSeg),
      demorados: n(p.demorados),
    })),
    cancelaciones: cancelaciones.map((c) => ({ motivo: c.motivo, items: n(c.items) })),
  };
}

// Vista del detalle de un plato desde el celular de una mesa: un contador por plato y día local.
export async function registrarVista(restauranteId: string, platoId: string) {
  await prisma.$executeRaw`
    INSERT INTO "VistaPlato" (id, "restauranteId", "platoId", dia, vistas, "updatedAt")
    SELECT gen_random_uuid(), r.id, pl.id, (now() AT TIME ZONE r."zonaHoraria")::date, 1, now()
    FROM "Plato" pl JOIN "Restaurante" r ON r.id = pl."restauranteId"
    WHERE pl.id = ${platoId}::uuid AND r.id = ${restauranteId}::uuid
    ON CONFLICT ("platoId", dia)
    DO UPDATE SET vistas = "VistaPlato".vistas + 1, "updatedAt" = now()`;
}
