-- Fase 11: aviso al mesero desde cocina, suspensión automática por falta de pago y Wi-Fi del local.

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN "listoAvisadoEn" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN "suspendidoPorPago" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "wifiClave" TEXT,
ADD COLUMN "wifiNombre" TEXT;

-- Pedidos que ya tenían todo listo: se toman como avisados a la hora del último plato listo (si no,
-- aparecerían de golpe en cocina esperando el botón "Listo · avisar mesero").
UPDATE "Pedido" p
SET "listoAvisadoEn" = x.listo
FROM (
  SELECT "pedidoId", MAX(COALESCE("listoEn", "updatedAt")) AS listo
  FROM "PedidoItem"
  WHERE NOT cancelado
  GROUP BY "pedidoId"
  HAVING BOOL_AND(estado IN ('LISTO', 'ENTREGADO'))
) x
WHERE p.id = x."pedidoId" AND p.estado = 'CONFIRMADO';
