-- CreateTable
CREATE TABLE "LineaCobro" (
    "id" UUID NOT NULL,
    "cuentaId" UUID NOT NULL,
    "pagoId" UUID,
    "metodo" "MetodoPago" NOT NULL,
    "monto" INTEGER NOT NULL,
    "recibido" INTEGER,
    "vuelto" INTEGER NOT NULL DEFAULT 0,
    "ultimos4" TEXT,
    "autorizacion" TEXT,
    "comprobante" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineaCobro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineaCobro_cuentaId_idx" ON "LineaCobro"("cuentaId");

-- CreateIndex
CREATE INDEX "LineaCobro_pagoId_idx" ON "LineaCobro"("pagoId");

-- AddForeignKey
ALTER TABLE "LineaCobro" ADD CONSTRAINT "LineaCobro_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaCobro" ADD CONSTRAINT "LineaCobro_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoCuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
