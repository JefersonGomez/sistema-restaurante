-- Pedidos en línea anteriores a la Fase 8: el teléfono solo con sus últimos 8 dígitos.
UPDATE "Cuenta"
SET "telefonoNormal" = RIGHT(REGEXP_REPLACE("clienteTelefono", '\D', '', 'g'), 8)
WHERE "clienteTelefono" IS NOT NULL AND "telefonoNormal" IS NULL;
