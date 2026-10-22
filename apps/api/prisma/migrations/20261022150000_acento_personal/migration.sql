-- AlterTable
ALTER TABLE "Restaurante" DROP COLUMN "colorPrimario",
ADD COLUMN     "colorAcento" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ultimoAcceso" TIMESTAMP(3);

