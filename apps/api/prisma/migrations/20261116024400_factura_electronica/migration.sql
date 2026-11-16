-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('TE', 'FE', 'NC');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ERROR');

-- CreateTable
CREATE TABLE "ConfigHacienda" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "ambiente" TEXT NOT NULL DEFAULT 'pruebas',
    "tipoId" TEXT NOT NULL,
    "numeroId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "correo" TEXT NOT NULL,
    "provincia" INTEGER NOT NULL,
    "canton" INTEGER NOT NULL,
    "distrito" INTEGER NOT NULL,
    "otrasSenas" TEXT NOT NULL,
    "actividad" TEXT NOT NULL,
    "usuarioCifrado" TEXT NOT NULL,
    "claveCifrada" TEXT NOT NULL,
    "llaveCifrada" TEXT NOT NULL,
    "pinCifrado" TEXT NOT NULL,
    "sucursal" INTEGER NOT NULL DEFAULT 1,
    "terminal" INTEGER NOT NULL DEFAULT 1,
    "siguienteTiquete" INTEGER NOT NULL DEFAULT 1,
    "siguienteFactura" INTEGER NOT NULL DEFAULT 1,
    "siguienteNota" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigHacienda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "cuentaId" UUID NOT NULL,
    "pagoId" UUID,
    "tipo" "TipoComprobante" NOT NULL,
    "numero" INTEGER NOT NULL,
    "consecutivo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "total" INTEGER NOT NULL,
    "ambiente" TEXT NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'PENDIENTE',
    "mensaje" TEXT,
    "xmlFirmado" TEXT,
    "respuestaXml" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receptorNombre" TEXT,
    "receptorTipoId" TEXT,
    "receptorNumero" TEXT,
    "receptorCorreo" TEXT,
    "referenciaId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigHacienda_restauranteId_key" ON "ConfigHacienda"("restauranteId");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_clave_key" ON "Comprobante"("clave");

-- CreateIndex
CREATE INDEX "Comprobante_estado_proximoIntento_idx" ON "Comprobante"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "Comprobante_cuentaId_idx" ON "Comprobante"("cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_restauranteId_tipo_numero_key" ON "Comprobante"("restauranteId", "tipo", "numero");

-- AddForeignKey
ALTER TABLE "ConfigHacienda" ADD CONSTRAINT "ConfigHacienda_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoCuenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
