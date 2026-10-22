-- Fase 3.3: horario por turnos, zona horaria, cierre manual y promoción.
-- Los datos del modelo anterior (horario único y Plato.destacado) se pasan al nuevo antes de borrarlos.

-- CreateTable
CREATE TABLE "HorarioRestaurante" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "abre" TEXT NOT NULL,
    "cierra" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HorarioRestaurante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorarioRestaurante_restauranteId_idx" ON "HorarioRestaurante"("restauranteId");

-- AddForeignKey
ALTER TABLE "HorarioRestaurante" ADD CONSTRAINT "HorarioRestaurante_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "cerradoManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "platoDestacadoId" UUID,
ADD COLUMN     "precioPromo" INTEGER,
ADD COLUMN     "textoPromoEn" TEXT,
ADD COLUMN     "textoPromoEs" TEXT,
ADD COLUMN     "zonaHoraria" TEXT NOT NULL DEFAULT 'America/Costa_Rica';

-- Datos: el horario único (mismo para todos los días) pasa a 7 turnos.
INSERT INTO "HorarioRestaurante" ("id", "restauranteId", "diaSemana", "abre", "cierra", "updatedAt")
SELECT gen_random_uuid(), r."id", d, r."horaApertura", r."horaCierre", CURRENT_TIMESTAMP
FROM "Restaurante" r CROSS JOIN generate_series(0, 6) AS d
WHERE r."horaApertura" IS NOT NULL AND r."horaCierre" IS NOT NULL;

-- Datos: el primer plato marcado como destacado pasa a ser el de la promoción.
UPDATE "Restaurante" r SET "platoDestacadoId" = (
  SELECT p."id" FROM "Plato" p
  WHERE p."restauranteId" = r."id" AND p."destacado" = true
  ORDER BY p."orden" LIMIT 1
);

-- AlterTable
ALTER TABLE "Restaurante" DROP COLUMN "horaApertura",
DROP COLUMN "horaCierre";

-- AlterTable
ALTER TABLE "Plato" DROP COLUMN "destacado";

-- AddForeignKey
ALTER TABLE "Restaurante" ADD CONSTRAINT "Restaurante_platoDestacadoId_fkey" FOREIGN KEY ("platoDestacadoId") REFERENCES "Plato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
