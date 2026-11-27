-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "vieneDeDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DemoDia" (
    "id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "creadas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoDia_dia_key" ON "DemoDia"("dia");
