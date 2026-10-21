-- CreateEnum
CREATE TYPE "ModoConfirmacion" AS ENUM ('SIEMPRE', 'PRIMER_PEDIDO', 'NUNCA');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'SINPE', 'MIXTO');

-- CreateEnum
CREATE TYPE "OrigenPedido" AS ENUM ('CLIENTE', 'MESERO');

-- DropIndex
DROP INDEX "Llamada_restauranteId_idx";

-- DropIndex
DROP INDEX "Pedido_cuentaId_idx";

-- DropIndex
DROP INDEX "Pedido_restauranteId_idx";

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "cerradaPorId" UUID,
ADD COLUMN     "metodoPago" "MetodoPago",
ADD COLUMN     "montoIva" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "montoServicio" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "numeroComensales" INTEGER,
ADD COLUMN     "subtotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verificada" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "clientRequestId" TEXT NOT NULL,
ADD COLUMN     "confirmadoEn" TIMESTAMP(3),
ADD COLUMN     "creadoPorUsuarioId" UUID,
ADD COLUMN     "origen" "OrigenPedido" NOT NULL DEFAULT 'CLIENTE';

-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "cancelado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enPreparacionEn" TIMESTAMP(3),
ADD COLUMN     "entregadoEn" TIMESTAMP(3),
ADD COLUMN     "listoEn" TIMESTAMP(3),
ADD COLUMN     "motivoCancelacion" TEXT;

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "modoConfirmacion" "ModoConfirmacion" NOT NULL DEFAULT 'PRIMER_PEDIDO';

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "estacionId" UUID;

-- CreateTable
CREATE TABLE "SesionCliente" (
    "id" UUID NOT NULL,
    "cuentaId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesionCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SesionCliente_tokenHash_key" ON "SesionCliente"("tokenHash");

-- CreateIndex
CREATE INDEX "SesionCliente_cuentaId_idx" ON "SesionCliente"("cuentaId");

-- CreateIndex
CREATE INDEX "Llamada_restauranteId_atendida_idx" ON "Llamada"("restauranteId", "atendida");

-- CreateIndex
CREATE INDEX "Llamada_mesaId_idx" ON "Llamada"("mesaId");

-- CreateIndex
CREATE INDEX "Pedido_restauranteId_estado_idx" ON "Pedido"("restauranteId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_cuentaId_clientRequestId_key" ON "Pedido"("cuentaId", "clientRequestId");

-- CreateIndex
CREATE INDEX "PedidoItem_estacionId_estado_idx" ON "PedidoItem"("estacionId", "estado");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_creadoPorUsuarioId_fkey" FOREIGN KEY ("creadoPorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionCliente" ADD CONSTRAINT "SesionCliente_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Solo una cuenta no CERRADA por mesa (índice único parcial; Prisma no lo modela en el schema).
CREATE UNIQUE INDEX "cuenta_unica_abierta" ON "Cuenta"("mesaId") WHERE "estado" <> 'CERRADA';
