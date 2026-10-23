import type { CuentaDetalle, ItemDetalle, PedidoDetalle } from '@menu-qr/shared';
import type { Prisma } from '../../generated/prisma/client';

// Forma única de leer pedidos/cuentas para comensal, mesero, caja y estación.

export const incluirItem = {
  plato: { select: { nombreEs: true, nombreEn: true } },
  modificadores: {
    orderBy: { createdAt: 'asc' },
    include: { modificador: { select: { nombreEn: true } } },
  },
} satisfies Prisma.PedidoItemInclude;

export const incluirPedido = {
  items: { orderBy: { createdAt: 'asc' }, include: incluirItem },
} satisfies Prisma.PedidoInclude;

export const incluirCuenta = {
  mesa: { select: { id: true, numero: true, nombre: true } },
  pedidos: { orderBy: { createdAt: 'asc' }, include: incluirPedido },
} satisfies Prisma.CuentaInclude;

type ItemDB = Prisma.PedidoItemGetPayload<{ include: typeof incluirItem }>;
type PedidoDB = Prisma.PedidoGetPayload<{ include: typeof incluirPedido }>;
type CuentaDB = Prisma.CuentaGetPayload<{ include: typeof incluirCuenta }>;

export const aItem = (i: ItemDB): ItemDetalle => ({
  id: i.id,
  platoId: i.platoId,
  nombreEs: i.plato.nombreEs,
  nombreEn: i.plato.nombreEn,
  estacionId: i.estacionId,
  cantidad: i.cantidad,
  notas: i.notas,
  precioUnitario: i.precioUnitario,
  estado: i.estado,
  cancelado: i.cancelado,
  motivoCancelacion: i.motivoCancelacion,
  modificadores: i.modificadores.map((m) => ({
    nombre: m.nombre,
    nombreEn: m.modificador?.nombreEn ?? null,
    precioExtra: m.precioExtra,
  })),
  updatedAt: i.updatedAt.toISOString(),
});

export const aPedido = (p: PedidoDB): PedidoDetalle => ({
  id: p.id,
  estado: p.estado,
  origen: p.origen,
  nota: p.nota,
  createdAt: p.createdAt.toISOString(),
  confirmadoEn: p.confirmadoEn?.toISOString() ?? null,
  updatedAt: p.updatedAt.toISOString(),
  items: p.items.map(aItem),
});

export const aCuenta = (c: CuentaDB): CuentaDetalle => ({
  id: c.id,
  estado: c.estado,
  mesa: c.mesa,
  verificada: c.verificada,
  subtotal: c.subtotal,
  montoServicio: c.montoServicio,
  montoIva: c.montoIva,
  total: c.total,
  metodoPago: c.metodoPago,
  abiertaEn: c.abiertaEn.toISOString(),
  cerradaEn: c.cerradaEn?.toISOString() ?? null,
  personas: c.numeroComensales,
  ingresoBloqueado: c.ingresoBloqueado,
  updatedAt: c.updatedAt.toISOString(),
  pedidos: c.pedidos.map(aPedido),
});
