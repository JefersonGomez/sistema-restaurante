-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "intentosPin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinBloqueadoHasta" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT;

-- CreateTable
CREATE TABLE "Dispositivo" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "estacionId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "codigoExpira" TIMESTAMP(3),
    "tokenHash" TEXT,
    "vinculadoEn" TIMESTAMP(3),
    "ultimoUso" TIMESTAMP(3),
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_codigo_key" ON "Dispositivo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_tokenHash_key" ON "Dispositivo"("tokenHash");

-- CreateIndex
CREATE INDEX "Dispositivo_restauranteId_idx" ON "Dispositivo"("restauranteId");

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispositivo" ADD CONSTRAINT "Dispositivo_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

