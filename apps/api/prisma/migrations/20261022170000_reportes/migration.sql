-- CreateTable
CREATE TABLE "VistaPlato" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "platoId" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "vistas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VistaPlato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VistaPlato_restauranteId_dia_idx" ON "VistaPlato"("restauranteId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "VistaPlato_platoId_dia_key" ON "VistaPlato"("platoId", "dia");

-- CreateIndex
CREATE INDEX "Cuenta_restauranteId_estado_cerradaEn_idx" ON "Cuenta"("restauranteId", "estado", "cerradaEn");

-- AddForeignKey
ALTER TABLE "VistaPlato" ADD CONSTRAINT "VistaPlato_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VistaPlato" ADD CONSTRAINT "VistaPlato_platoId_fkey" FOREIGN KEY ("platoId") REFERENCES "Plato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

