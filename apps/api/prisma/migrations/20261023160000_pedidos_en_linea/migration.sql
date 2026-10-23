-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('MESA', 'RECOGER', 'DOMICILIO');

-- CreateEnum
CREATE TYPE "EtapaEnLinea" AS ENUM ('RECIBIDO', 'ACEPTADO', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'RECHAZADO');

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "clienteNombre" TEXT,
ADD COLUMN     "clienteTelefono" TEXT,
ADD COLUMN     "comprobanteSinpe" TEXT,
ADD COLUMN     "costoEnvio" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "direccionEntrega" TEXT,
ADD COLUMN     "etapa" "EtapaEnLinea",
ADD COLUMN     "motivoRechazo" TEXT,
ADD COLUMN     "numeroPedido" INTEGER,
ADD COLUMN     "pagoElegido" "MetodoPago",
ADD COLUMN     "pagoVerificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenciaEntrega" TEXT,
ADD COLUMN     "tiempoEstimadoMin" INTEGER,
ADD COLUMN     "tipo" "TipoCuenta" NOT NULL DEFAULT 'MESA',
ADD COLUMN     "tokenSeguimiento" TEXT,
ALTER COLUMN "mesaId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "costoEnvio" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enLineaActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enLineaDomicilio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enLineaRecoger" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pedidoMinimo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sinpeNombre" TEXT,
ADD COLUMN     "sinpeNumero" TEXT,
ADD COLUMN     "tiempoEstimadoMin" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "zonaEntrega" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cuenta_tokenSeguimiento_key" ON "Cuenta"("tokenSeguimiento");

-- CreateIndex
CREATE INDEX "Cuenta_restauranteId_tipo_etapa_idx" ON "Cuenta"("restauranteId", "tipo", "etapa");

