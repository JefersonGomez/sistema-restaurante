import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

// Cobrado por método en las cuentas cerradas que cumplan `filtro` (condición SQL sobre "Cuenta").
// Con detalle del cobro (Fase 13) cada parte suma en su método; si no hay detalle, el grupo o la
// cuenta completa cuenta en su método (cuentas viejas y en línea). Lo usan Reportes y el arqueo.
export async function cobradoPorMetodo(restauranteId: string, filtro: Prisma.Sql) {
  const filas = await prisma.$queryRaw<{ metodo: string; total: bigint; cuentas: bigint }[]>`
    WITH c AS (
      SELECT id, total, "metodoPago" FROM "Cuenta"
      WHERE "restauranteId" = ${restauranteId}::uuid AND estado = 'CERRADA'
        AND etapa IS DISTINCT FROM 'RECHAZADO' AND (${filtro})
    ), partes AS (
      SELECT l."cuentaId", l.metodo::text AS metodo, l.monto AS total
      FROM "LineaCobro" l JOIN c ON c.id = l."cuentaId"
      UNION ALL
      SELECT p."cuentaId", p."metodoPago"::text, p.total
      FROM "PagoCuenta" p JOIN c ON c.id = p."cuentaId"
      WHERE NOT EXISTS (SELECT 1 FROM "LineaCobro" l WHERE l."pagoId" = p.id)
      UNION ALL
      SELECT c.id, COALESCE(c."metodoPago"::text, 'SIN_DATO'), c.total FROM c
      WHERE NOT EXISTS (SELECT 1 FROM "PagoCuenta" p WHERE p."cuentaId" = c.id)
        AND NOT EXISTS (SELECT 1 FROM "LineaCobro" l WHERE l."cuentaId" = c.id)
    )
    SELECT metodo, SUM(total) AS total, COUNT(DISTINCT "cuentaId") AS cuentas
    FROM partes GROUP BY 1 ORDER BY 2 DESC`;
  return filas.map((f) => ({
    metodo: f.metodo,
    total: Number(f.total),
    cuentas: Number(f.cuentas),
  }));
}
