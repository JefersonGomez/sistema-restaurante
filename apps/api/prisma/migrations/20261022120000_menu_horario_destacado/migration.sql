-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "icono" TEXT;

-- AlterTable
ALTER TABLE "Plato" ADD COLUMN     "destacado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "horaApertura" TEXT,
ADD COLUMN     "horaCierre" TEXT;

