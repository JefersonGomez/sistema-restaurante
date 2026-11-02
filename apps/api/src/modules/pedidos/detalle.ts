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

// Cómo se nombra el origen de una cuenta en pantallas y avisos: "Mesa 3", "Para llevar #12 · Ana".
export const datosLugar = {
  tipo: true,
  numeroPedido: true,
  clienteNombre: true,
  mesa: { select: { numero: true, nombre: true } },
} as const;
export function lugarDe(c: {
  tipo: string;
  numeroPedido: number | null;
  clienteNombre: string | null;
  mesa: { numero: number } | null;
}) {
  if (c.mesa) return `Mesa ${c.mesa.numero}`;
  const tipo = c.tipo === 'DOMICILIO' ? 'Domicilio' : 'Para llevar';
  return `${tipo} #${c.numeroPedido ?? ''}${c.clienteNombre ? ` · ${c.clienteNombre}` : ''}`;
}

export const incluirCuenta = {
  mesa: { select: { id: true, numero: true, nombre: true } },
  pedidos: { orderBy: { createdAt: 'asc' }, include: incluirPedido },
  pagos: { orderBy: { createdAt: 'asc' } },
  repartidor: { select: { id: true, nombre: true } },
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
  pagoId: i.pagoId,
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
  tipo: c.tipo,
  lugar: lugarDe(c),
  enLinea:
    c.tipo === 'MESA'
      ? null
      : {
          numero: c.numeroPedido ?? 0,
          clienteNombre: c.clienteNombre ?? '',
          clienteTelefono: c.clienteTelefono ?? '',
          direccion: c.direccionEntrega,
          referencia: c.referenciaEntrega,
          costoEnvio: c.costoEnvio,
          pagoElegido: c.pagoElegido,
          comprobanteSinpe: c.comprobanteSinpe,
          pagoVerificado: c.pagoVerificado,
          pagarAntesDe: c.pagarAntesDe?.toISOString() ?? null,
          etapa: c.etapa ?? 'RECIBIDO',
          tiempoEstimadoMin: c.tiempoEstimadoMin,
          motivoRechazo: c.motivoRechazo,
          ubicacion:
            c.latEntrega != null && c.lngEntrega != null
              ? { lat: c.latEntrega, lng: c.lngEntrega }
              : null,
          repartidor: c.repartidor,
          efectivoCuadrado: c.efectivoCuadrado,
        },
  verificada: c.verificada,
  subtotal: c.subtotal,
  montoServicio: c.montoServicio,
  montoIva: c.montoIva,
  total: c.total,
  metodoPago: c.metodoPago,
  abiertaEn: c.abiertaEn.toISOString(),
  cerradaEn: c.cerradaEn?.toISOString() ?? null,
  personas: c.numeroComensales,
  pagos: c.pagos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    metodoPago: p.metodoPago,
    subtotal: p.subtotal,
    montoServicio: p.montoServicio,
    montoIva: p.montoIva,
    total: p.total,
    createdAt: p.createdAt.toISOString(),
  })),
  ingresoBloqueado: c.ingresoBloqueado,
  updatedAt: c.updatedAt.toISOString(),
  pedidos: c.pedidos.map(aPedido),
});
