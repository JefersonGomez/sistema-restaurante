-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('CRC', 'USD');

-- CreateEnum
CREATE TYPE "Idioma" AS ENUM ('es', 'en');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPERADMIN', 'DUENO', 'MESERO', 'COCINA', 'CAJA');

-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('ABIERTA', 'PIDIO_CUENTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoPedidoItem" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "TipoLlamada" AS ENUM ('MESERO', 'CUENTA');

-- CreateTable
CREATE TABLE "Restaurante" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "colorPrimario" TEXT NOT NULL DEFAULT '#0f766e',
    "moneda" "Moneda" NOT NULL DEFAULT 'CRC',
    "idiomas" "Idioma"[] DEFAULT ARRAY['es', 'en']::"Idioma"[],
    "porcentajeIva" INTEGER NOT NULL DEFAULT 13,
    "porcentajeServicio" INTEGER NOT NULL DEFAULT 10,
    "preciosIncluyenImpuestos" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'basico',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restaurante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "restauranteId" UUID,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estacion" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mesa" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" TEXT,
    "tokenQr" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "nombreEs" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plato" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "categoriaId" UUID NOT NULL,
    "estacionId" UUID NOT NULL,
    "nombreEs" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL,
    "descripcionEs" TEXT,
    "descripcionEn" TEXT,
    "precio" INTEGER NOT NULL,
    "fotoUrl" TEXT,
    "agotado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "alergenos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoModificadores" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "platoId" UUID NOT NULL,
    "nombreEs" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "minimo" INTEGER NOT NULL DEFAULT 0,
    "maximo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoModificadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modificador" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "grupoId" UUID NOT NULL,
    "nombreEs" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL,
    "precioExtra" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Modificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuenta" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "mesaId" UUID NOT NULL,
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'ABIERTA',
    "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "cuentaId" UUID NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "confirmadoPorId" UUID,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoItem" (
    "id" UUID NOT NULL,
    "pedidoId" UUID NOT NULL,
    "platoId" UUID NOT NULL,
    "estacionId" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "notas" TEXT,
    "precioUnitario" INTEGER NOT NULL,
    "estado" "EstadoPedidoItem" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoItemModificador" (
    "id" UUID NOT NULL,
    "pedidoItemId" UUID NOT NULL,
    "modificadorId" UUID,
    "nombre" TEXT NOT NULL,
    "precioExtra" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoItemModificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Llamada" (
    "id" UUID NOT NULL,
    "restauranteId" UUID NOT NULL,
    "mesaId" UUID NOT NULL,
    "tipo" "TipoLlamada" NOT NULL,
    "atendida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Llamada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurante_slug_key" ON "Restaurante"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_restauranteId_idx" ON "Usuario"("restauranteId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");

-- CreateIndex
CREATE INDEX "Estacion_restauranteId_idx" ON "Estacion"("restauranteId");

-- CreateIndex
CREATE UNIQUE INDEX "Estacion_restauranteId_nombre_key" ON "Estacion"("restauranteId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_tokenQr_key" ON "Mesa"("tokenQr");

-- CreateIndex
CREATE INDEX "Mesa_restauranteId_idx" ON "Mesa"("restauranteId");

-- CreateIndex
CREATE UNIQUE INDEX "Mesa_restauranteId_numero_key" ON "Mesa"("restauranteId", "numero");

-- CreateIndex
CREATE INDEX "Categoria_restauranteId_idx" ON "Categoria"("restauranteId");

-- CreateIndex
CREATE INDEX "Plato_restauranteId_idx" ON "Plato"("restauranteId");

-- CreateIndex
CREATE INDEX "Plato_categoriaId_idx" ON "Plato"("categoriaId");

-- CreateIndex
CREATE INDEX "GrupoModificadores_restauranteId_idx" ON "GrupoModificadores"("restauranteId");

-- CreateIndex
CREATE INDEX "GrupoModificadores_platoId_idx" ON "GrupoModificadores"("platoId");

-- CreateIndex
CREATE INDEX "Modificador_restauranteId_idx" ON "Modificador"("restauranteId");

-- CreateIndex
CREATE INDEX "Modificador_grupoId_idx" ON "Modificador"("grupoId");

-- CreateIndex
CREATE INDEX "Cuenta_restauranteId_idx" ON "Cuenta"("restauranteId");

-- CreateIndex
CREATE INDEX "Cuenta_mesaId_idx" ON "Cuenta"("mesaId");

-- CreateIndex
CREATE INDEX "Pedido_restauranteId_idx" ON "Pedido"("restauranteId");

-- CreateIndex
CREATE INDEX "Pedido_cuentaId_idx" ON "Pedido"("cuentaId");

-- CreateIndex
CREATE INDEX "PedidoItem_pedidoId_idx" ON "PedidoItem"("pedidoId");

-- CreateIndex
CREATE INDEX "PedidoItemModificador_pedidoItemId_idx" ON "PedidoItemModificador"("pedidoItemId");

-- CreateIndex
CREATE INDEX "Llamada_restauranteId_idx" ON "Llamada"("restauranteId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estacion" ADD CONSTRAINT "Estacion_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plato" ADD CONSTRAINT "Plato_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plato" ADD CONSTRAINT "Plato_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plato" ADD CONSTRAINT "Plato_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoModificadores" ADD CONSTRAINT "GrupoModificadores_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoModificadores" ADD CONSTRAINT "GrupoModificadores_platoId_fkey" FOREIGN KEY ("platoId") REFERENCES "Plato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modificador" ADD CONSTRAINT "Modificador_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modificador" ADD CONSTRAINT "Modificador_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoModificadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_platoId_fkey" FOREIGN KEY ("platoId") REFERENCES "Plato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItem" ADD CONSTRAINT "PedidoItem_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItemModificador" ADD CONSTRAINT "PedidoItemModificador_pedidoItemId_fkey" FOREIGN KEY ("pedidoItemId") REFERENCES "PedidoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoItemModificador" ADD CONSTRAINT "PedidoItemModificador_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "Modificador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Llamada" ADD CONSTRAINT "Llamada_restauranteId_fkey" FOREIGN KEY ("restauranteId") REFERENCES "Restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Llamada" ADD CONSTRAINT "Llamada_mesaId_fkey" FOREIGN KEY ("mesaId") REFERENCES "Mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
