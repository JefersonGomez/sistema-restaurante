-- AlterTable
ALTER TABLE "Comprobante" ADD COLUMN     "correoEnviadoEn" TIMESTAMP(3),
ADD COLUMN     "correoError" TEXT,
ADD COLUMN     "correoPara" TEXT;
