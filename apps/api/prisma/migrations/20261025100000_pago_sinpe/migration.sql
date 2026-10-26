-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "pagarAntesDe" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "minutosPagoSinpe" INTEGER NOT NULL DEFAULT 15;

