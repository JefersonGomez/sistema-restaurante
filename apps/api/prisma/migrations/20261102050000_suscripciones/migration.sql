-- Fase 9: planes, pagos de la mensualidad y recuperar contraseña.

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('BASICO', 'COMPLETO');

-- CreateEnum
CREATE TYPE "MetodoCobro" AS ENUM ('SINPE', 'TRANSFERENCIA', 'EFECTIVO', 'OTRO');

-- El plan pasa de texto libre a enum. Los restaurantes que ya existían conservan todas las
-- funciones (COMPLETO) y quedan en prueba por 30 días desde hoy.
ALTER TABLE "Restaurante" DROP COLUMN "plan";
ALTER TABLE "Restaurante" ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'COMPLETO';
ALTER TABLE "Restaurante" ADD COLUMN "planVenceEn" TIMESTAMP(3);
UPDATE "Restaurante" SET "planVenceEn" = CURRENT_TIMESTAMP + INTERVAL '30 days';

-- CreateTable
CREATE TABLE "PagoSuscripcion" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "plan" "Plan" NOT NULL,
    "meses" INTEGER NOT NULL,
    "monto" INTEGER NOT NULL,
    "metodo" "MetodoCobro" NOT NULL,
    "referencia" TEXT,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "registradoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagoSuscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecuperacionPassword" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "clienteId" UUID,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecuperacionPassword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoSuscripcion_restauranteId_idx" ON "PagoSuscripcion"("restauranteId");

-- CreateIndex
CREATE INDEX "PagoSuscripcion_createdAt_idx" ON "PagoSuscripcion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecuperacionPassword_tokenHash_key" ON "RecuperacionPassword"("tokenHash");

-- AddForeignKey
ALTER TABLE "PagoSuscripcion" ADD CONSTRAINT "PagoSuscripcion_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecuperacionPassword" ADD CONSTRAINT "RecuperacionPassword_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecuperacionPassword" ADD CONSTRAINT "RecuperacionPassword_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteRegistrado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
