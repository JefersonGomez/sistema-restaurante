-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "clienteId" UUID,
ADD COLUMN     "telefonoNormal" TEXT;

-- AlterTable
ALTER TABLE "Restaurante" ADD COLUMN     "fidelidadActiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "premioFidelidad" TEXT,
ADD COLUMN     "sellosMeta" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "ClienteRegistrado" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "telefonoNormal" TEXT NOT NULL,
    "direccion" TEXT,
    "referencia" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteRegistrado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionClienteRegistrado" (
    "id" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesionClienteRegistrado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanjeSello" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "telefonoNormal" TEXT NOT NULL,
    "sellos" INTEGER NOT NULL,
    "premio" TEXT NOT NULL,
    "usuarioId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanjeSello_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClienteRegistrado_restauranteId_telefonoNormal_idx" ON "ClienteRegistrado"("restauranteId", "telefonoNormal");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteRegistrado_restauranteId_email_key" ON "ClienteRegistrado"("restauranteId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "SesionClienteRegistrado_tokenHash_key" ON "SesionClienteRegistrado"("tokenHash");

-- CreateIndex
CREATE INDEX "SesionClienteRegistrado_clienteId_idx" ON "SesionClienteRegistrado"("clienteId");

-- CreateIndex
CREATE INDEX "CanjeSello_restauranteId_telefonoNormal_idx" ON "CanjeSello"("restauranteId", "telefonoNormal");

-- CreateIndex
CREATE INDEX "Cuenta_restauranteId_telefonoNormal_idx" ON "Cuenta"("restauranteId", "telefonoNormal");

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteRegistrado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteRegistrado" ADD CONSTRAINT "ClienteRegistrado_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesionClienteRegistrado" ADD CONSTRAINT "SesionClienteRegistrado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteRegistrado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanjeSello" ADD CONSTRAINT "CanjeSello_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
