-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'REPARTIDOR';

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "efectivoCuadrado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latEntrega" DOUBLE PRECISION,
ADD COLUMN     "lngEntrega" DOUBLE PRECISION,
ADD COLUMN     "repartidorId" UUID;

-- CreateIndex
CREATE INDEX "Cuenta_restauranteId_repartidorId_idx" ON "Cuenta"("restauranteId", "repartidorId");

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
