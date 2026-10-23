-- AlterTable
ALTER TABLE "Plato" ADD COLUMN     "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "fechaMenu" DATE,
ADD COLUMN     "menuDelDia" BOOLEAN NOT NULL DEFAULT false;

