-- Domicilios en efectivo cerrados desde la caja sin repartidor: el efectivo ya estaba en la caja,
-- así que entra al turno con la hora en que se cerró la cuenta (antes no contaban en el arqueo).
UPDATE "Cuenta"
SET "efectivoCuadrado" = true, "efectivoRecibidoEn" = "cerradaEn"
WHERE tipo = 'DOMICILIO'
  AND etapa = 'ENTREGADO'
  AND "metodoPago" = 'EFECTIVO'
  AND "repartidorId" IS NULL
  AND "efectivoCuadrado" = false
  AND "cerradaEn" IS NOT NULL;
