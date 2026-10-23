-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "ingresoBloqueado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rechazosIngreso" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SolicitudIngreso" (
    "id" UUID NOT NULL,
    "cuentaId" UUID NOT NULL,
    "claveHash" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "entregada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudIngreso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolicitudIngreso_claveHash_key" ON "SolicitudIngreso"("claveHash");

-- CreateIndex
CREATE INDEX "SolicitudIngreso_cuentaId_createdAt_idx" ON "SolicitudIngreso"("cuentaId", "createdAt");

-- AddForeignKey
ALTER TABLE "SolicitudIngreso" ADD CONSTRAINT "SolicitudIngreso_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

