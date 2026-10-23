-- AlterTable
ALTER TABLE "PedidoItem" ADD COLUMN     "pagoId" UUID;

-- CreateTable
CREATE TABLE "PagoCuenta" (
    "id" UUID NOT NULL,
    "cuentaId" UUID NOT NULL,
    "nombre" TEXT,
    "metodoPago" "MetodoPago" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "montoServicio" INTEGER NOT NULL,
    "montoIva" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "cobradoPorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagoCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoCuenta_cuentaId_idx" ON "PagoCuenta"("cuentaId");

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoCuenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoCuenta" ADD CONSTRAINT "PagoCuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

