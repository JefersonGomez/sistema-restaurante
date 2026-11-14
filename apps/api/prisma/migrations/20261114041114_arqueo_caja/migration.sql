-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('ENTRADA', 'SALIDA');

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "efectivoRecibidoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TurnoCaja" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "abiertoPorId" UUID NOT NULL,
    "abiertoPorNombre" TEXT NOT NULL,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fondoInicial" INTEGER NOT NULL,
    "cerradoPorId" UUID,
    "cerradoPorNombre" TEXT,
    "cerradoEn" TIMESTAMP(3),
    "ventasEfectivo" INTEGER,
    "ventasTarjeta" INTEGER,
    "ventasSinpe" INTEGER,
    "cuentas" INTEGER,
    "entradas" INTEGER,
    "salidas" INTEGER,
    "efectivoEsperado" INTEGER,
    "efectivoContado" INTEGER,
    "diferencia" INTEGER,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" UUID NOT NULL,
    "turnoId" UUID NOT NULL,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "monto" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TurnoCaja_restauranteId_abiertoEn_idx" ON "TurnoCaja"("restauranteId", "abiertoEn");

-- CreateIndex
CREATE INDEX "MovimientoCaja_turnoId_idx" ON "MovimientoCaja"("turnoId");

-- AddForeignKey
ALTER TABLE "TurnoCaja" ADD CONSTRAINT "TurnoCaja_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "TurnoCaja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una sola caja abierta por restaurante.
CREATE UNIQUE INDEX "TurnoCaja_una_abierta" ON "TurnoCaja"("restauranteId") WHERE "cerradoEn" IS NULL;
