import type { PedidoDetalle } from '@menu-qr/shared';
import { emitToCuenta, emitToRestaurant } from '../../realtime';

// Avisos por socket. Se llaman SIEMPRE después del commit. Cada payload lleva `updatedAt`
// para que el frontend ignore eventos viejos; ante cualquier duda el cliente vuelve a pedir por REST.

type Ctx = { restauranteId: string; cuentaId: string; mesa: { numero: number } };

export function pedidoNuevo(ctx: Ctx, pedido: PedidoDetalle) {
  const aviso = {
    cuentaId: ctx.cuentaId,
    mesa: ctx.mesa,
    pedidoId: pedido.id,
    updatedAt: pedido.updatedAt,
  };
  emitToRestaurant(ctx.restauranteId, 'meseros', 'pedido:nuevo', aviso);
  emitToCuenta(ctx.cuentaId, 'pedido:nuevo', aviso);
}

// Cada estación recibe solo sus ítems.
export function pedidoConfirmado(ctx: Ctx, pedido: PedidoDetalle) {
  const base = {
    cuentaId: ctx.cuentaId,
    mesa: ctx.mesa,
    pedidoId: pedido.id,
    updatedAt: pedido.updatedAt,
  };
  const porEstacion = new Map<string, PedidoDetalle['items']>();
  for (const i of pedido.items.filter((i) => !i.cancelado))
    porEstacion.set(i.estacionId, [...(porEstacion.get(i.estacionId) ?? []), i]);
  for (const [estacion, items] of porEstacion)
    emitToRestaurant(ctx.restauranteId, { estacion }, 'pedido:confirmado', {
      ...base,
      confirmadoEn: pedido.confirmadoEn,
      nota: pedido.nota,
      items,
    });
  emitToRestaurant(ctx.restauranteId, 'meseros', 'pedido:confirmado', base);
  emitToCuenta(ctx.cuentaId, 'pedido:confirmado', base);
}

export function pedidoCancelado(ctx: Ctx, pedido: PedidoDetalle) {
  const aviso = {
    cuentaId: ctx.cuentaId,
    mesa: ctx.mesa,
    pedidoId: pedido.id,
    updatedAt: pedido.updatedAt,
  };
  emitToRestaurant(ctx.restauranteId, 'meseros', 'pedido:cancelado', aviso);
  emitToCuenta(ctx.cuentaId, 'pedido:cancelado', aviso);
}

export function itemEstado(
  ctx: Ctx,
  item: {
    id: string;
    pedidoId: string;
    estacionId: string;
    estado: string;
    cancelado: boolean;
    updatedAt: string;
  },
) {
  const aviso = { cuentaId: ctx.cuentaId, mesa: ctx.mesa, ...item, itemId: item.id };
  emitToRestaurant(ctx.restauranteId, { estacion: item.estacionId }, 'item:estado', aviso);
  emitToRestaurant(ctx.restauranteId, 'meseros', 'item:estado', aviso);
  emitToCuenta(ctx.cuentaId, 'item:estado', aviso);
}

export function cuentaActualizada(
  ctx: Ctx,
  cuenta: {
    estado: string;
    subtotal: number;
    montoServicio: number;
    montoIva: number;
    total: number;
    updatedAt: Date;
  },
) {
  const { estado, subtotal, montoServicio, montoIva, total } = cuenta;
  const aviso = {
    cuentaId: ctx.cuentaId,
    mesa: ctx.mesa,
    estado,
    subtotal,
    montoServicio,
    montoIva,
    total,
    updatedAt: cuenta.updatedAt.toISOString(),
  };
  emitToCuenta(ctx.cuentaId, 'cuenta:actualizada', aviso);
  emitToRestaurant(ctx.restauranteId, 'caja', 'cuenta:actualizada', aviso);
}

export function cuentaSolicitada(ctx: Ctx, updatedAt: Date) {
  const aviso = { cuentaId: ctx.cuentaId, mesa: ctx.mesa, updatedAt: updatedAt.toISOString() };
  emitToRestaurant(ctx.restauranteId, 'meseros', 'cuenta:solicitada', aviso);
  emitToRestaurant(ctx.restauranteId, 'caja', 'cuenta:solicitada', aviso);
  emitToCuenta(ctx.cuentaId, 'cuenta:actualizada', aviso);
}

export function cuentaCerrada(ctx: Ctx, updatedAt: Date) {
  const aviso = { cuentaId: ctx.cuentaId, mesa: ctx.mesa, updatedAt: updatedAt.toISOString() };
  emitToCuenta(ctx.cuentaId, 'cuenta:cerrada', aviso);
  emitToRestaurant(ctx.restauranteId, 'meseros', 'cuenta:cerrada', aviso);
  emitToRestaurant(ctx.restauranteId, 'caja', 'cuenta:cerrada', aviso);
}

export function mesaLlamada(
  ctx: Ctx,
  llamada: { id: string; tipo: string; createdAt: Date; updatedAt: Date },
) {
  emitToRestaurant(ctx.restauranteId, 'meseros', 'mesa:llamada', {
    cuentaId: ctx.cuentaId,
    mesa: ctx.mesa,
    llamadaId: llamada.id,
    tipo: llamada.tipo,
    updatedAt: llamada.updatedAt.toISOString(),
  });
}

// Alguien con el cupo lleno pide unirse: les llega a los celulares de la mesa para aceptar o no.
export function ingresoSolicitado(cuentaId: string, solicitud: { id: string; createdAt: Date }) {
  emitToCuenta(cuentaId, 'ingreso:solicitado', {
    id: solicitud.id,
    createdAt: solicitud.createdAt.toISOString(),
  });
}
export function ingresoResuelto(cuentaId: string, id: string, estado: string) {
  emitToCuenta(cuentaId, 'ingreso:resuelto', { id, estado });
}
