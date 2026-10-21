import type {
  CrearPedidoInput,
  EstadoItem,
  EstadoMesa,
  EstadoPedido,
  MesaOperacion,
  MetodoPago,
  PedidoEstacion,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import type { UsuarioToken } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import {
  aCuenta,
  aItem,
  aPedido,
  incluirCuenta,
  incluirItem,
  incluirPedido,
} from '../pedidos/detalle';
import * as avisar from '../pedidos/eventos';
import {
  bloquearCuenta,
  crearPedido,
  obtenerOCrearCuenta,
  recalcularCuenta,
} from '../pedidos/pedidos.service';
import { emitToRestaurant } from '../../realtime';

const invalida = (mensaje: string) => new HttpError(409, 'TRANSICION_INVALIDA', mensaje);
const ITEMS_ACTIVOS: EstadoItem[] = ['PENDIENTE', 'EN_PREPARACION', 'LISTO'];

// Pedido de este restaurante con lo necesario para validar y avisar.
async function pedidoDelRestaurante(restauranteId: string, pedidoId: string) {
  const p = await prisma.pedido.findFirst({
    where: { id: pedidoId, restauranteId },
    select: { cuentaId: true, cuenta: { select: { mesa: { select: { numero: true } } } } },
  });
  if (!p) throw noExiste('Pedido');
  return { restauranteId, cuentaId: p.cuentaId, mesa: p.cuenta.mesa };
}

// --- Pedidos: PENDIENTE → CONFIRMADO | CANCELADO ---

export async function confirmarPedido(restauranteId: string, usuarioId: string, pedidoId: string) {
  const ctx = await pedidoDelRestaurante(restauranteId, pedidoId);
  const { pedido, cuenta } = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, ctx.cuentaId);
    const actual = await tx.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: { cuenta: true },
    });
    if (actual.cuenta.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');
    if (actual.estado !== 'PENDIENTE') throw invalida(`El pedido ya está ${actual.estado}`);
    const pedido = await tx.pedido.update({
      where: { id: pedidoId },
      data: { estado: 'CONFIRMADO', confirmadoPorId: usuarioId, confirmadoEn: new Date() },
      include: incluirPedido,
    });
    // Con PRIMER_PEDIDO, tras la primera confirmación la cuenta queda verificada.
    await tx.cuenta.update({ where: { id: ctx.cuentaId }, data: { verificada: true } });
    return { pedido: aPedido(pedido), cuenta: await recalcularCuenta(tx, ctx.cuentaId) };
  });
  avisar.pedidoConfirmado(ctx, pedido);
  avisar.cuentaActualizada(ctx, cuenta);
  return pedido;
}

export async function cancelarPedido(restauranteId: string, pedidoId: string, motivo: string) {
  const ctx = await pedidoDelRestaurante(restauranteId, pedidoId);
  const pedido = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, ctx.cuentaId);
    const actual = await tx.pedido.findUniqueOrThrow({ where: { id: pedidoId } });
    if (actual.estado !== 'PENDIENTE') throw invalida(`El pedido ya está ${actual.estado}`);
    await tx.pedidoItem.updateMany({
      where: { pedidoId },
      data: { cancelado: true, motivoCancelacion: motivo },
    });
    return aPedido(
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: 'CANCELADO' },
        include: incluirPedido,
      }),
    );
  });
  avisar.pedidoCancelado(ctx, pedido);
  return pedido;
}

// --- Ítems: PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO ---

const ANTERIOR: Record<'EN_PREPARACION' | 'LISTO' | 'ENTREGADO', EstadoItem> = {
  EN_PREPARACION: 'PENDIENTE',
  LISTO: 'EN_PREPARACION',
  ENTREGADO: 'LISTO',
};
const MARCA_TIEMPO = {
  EN_PREPARACION: 'enPreparacionEn',
  LISTO: 'listoEn',
  ENTREGADO: 'entregadoEn',
} as const;

async function itemDelRestaurante(restauranteId: string, itemId: string) {
  const item = await prisma.pedidoItem.findFirst({
    where: { id: itemId, pedido: { restauranteId } },
    include: {
      pedido: {
        select: {
          estado: true,
          cuentaId: true,
          cuenta: { select: { estado: true, mesa: { select: { numero: true } } } },
        },
      },
    },
  });
  if (!item) throw noExiste('Ítem');
  return item;
}

export async function cambiarEstadoItem(
  restauranteId: string,
  usuario: UsuarioToken,
  itemId: string,
  estado: keyof typeof ANTERIOR,
) {
  const item = await itemDelRestaurante(restauranteId, itemId);

  // Cocina prepara (solo su estación si tiene una asignada); el mesero entrega; el dueño todo.
  if (usuario.rol === 'COCINA') {
    if (estado === 'ENTREGADO') throw new HttpError(403, 'PROHIBIDO', 'Cocina no marca entregas');
    const { estacionId } = await prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: { estacionId: true },
    });
    if (estacionId && estacionId !== item.estacionId)
      throw new HttpError(403, 'PROHIBIDO', 'El ítem es de otra estación');
  }
  if (usuario.rol === 'MESERO' && estado !== 'ENTREGADO')
    throw new HttpError(403, 'PROHIBIDO', 'El mesero solo marca entregas');

  if (item.pedido.estado !== 'CONFIRMADO') throw invalida('El pedido no está confirmado');
  if (item.pedido.cuenta.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');

  // Transición atómica: solo avanza si sigue en el estado anterior (evita dobles toques).
  const { count } = await prisma.pedidoItem.updateMany({
    where: { id: itemId, estado: ANTERIOR[estado], cancelado: false },
    data: { estado, [MARCA_TIEMPO[estado]]: new Date() },
  });
  if (count === 0)
    throw invalida(
      `No se puede pasar de ${item.cancelado ? 'CANCELADO' : item.estado} a ${estado}`,
    );

  const final = await prisma.pedidoItem.findUniqueOrThrow({
    where: { id: itemId },
    include: incluirItem,
  });
  const detalle = aItem(final);
  avisar.itemEstado(
    { restauranteId, cuentaId: item.pedido.cuentaId, mesa: item.pedido.cuenta.mesa },
    { ...detalle, pedidoId: item.pedidoId },
  );
  return detalle;
}

// Se puede cancelar mientras no esté LISTO; requiere motivo.
export async function cancelarItem(restauranteId: string, itemId: string, motivo: string) {
  const item = await itemDelRestaurante(restauranteId, itemId);
  const ctx = { restauranteId, cuentaId: item.pedido.cuentaId, mesa: item.pedido.cuenta.mesa };
  const { detalle, cuenta } = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, ctx.cuentaId);
    const actual = await tx.pedidoItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { pedido: { select: { estado: true, cuenta: { select: { estado: true } } } } },
    });
    if (actual.cancelado) throw invalida('El ítem ya está cancelado');
    if (!['PENDIENTE', 'EN_PREPARACION'].includes(actual.estado))
      throw invalida(`Un ítem ${actual.estado} ya no se puede cancelar`);
    if (actual.pedido.cuenta.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');
    const final = await tx.pedidoItem.update({
      where: { id: itemId },
      data: { cancelado: true, motivoCancelacion: motivo },
      include: incluirItem,
    });
    const cuenta =
      actual.pedido.estado === 'CONFIRMADO' ? await recalcularCuenta(tx, ctx.cuentaId) : null;
    return { detalle: aItem(final), cuenta };
  });
  avisar.itemEstado(ctx, { ...detalle, pedidoId: item.pedidoId });
  if (cuenta) avisar.cuentaActualizada(ctx, cuenta);
  return detalle;
}

// --- Cuentas: ABIERTA | PIDIO_CUENTA → CERRADA ---

export async function cerrarCuenta(
  restauranteId: string,
  usuarioId: string,
  cuentaId: string,
  metodoPago: MetodoPago,
) {
  const existe = await prisma.cuenta.findFirst({
    where: { id: cuentaId, restauranteId },
    select: { mesaId: true, mesa: { select: { numero: true } } },
  });
  if (!existe) throw noExiste('Cuenta');

  const cuenta = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, cuentaId);
    const actual = await tx.cuenta.findUniqueOrThrow({ where: { id: cuentaId } });
    if (actual.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');
    const pendientes = await tx.pedido.count({ where: { cuentaId, estado: 'PENDIENTE' } });
    if (pendientes > 0)
      throw new HttpError(409, 'PEDIDOS_PENDIENTES', 'Hay pedidos sin confirmar o cancelar');
    await recalcularCuenta(tx, cuentaId);
    // La sesión del comensal deja de servir y la mesa queda libre.
    await tx.sesionCliente.updateMany({ where: { cuentaId }, data: { revocada: true } });
    await tx.llamada.updateMany({
      where: { restauranteId, mesaId: existe.mesaId, atendida: false },
      data: { atendida: true },
    });
    return tx.cuenta.update({
      where: { id: cuentaId },
      data: { estado: 'CERRADA', metodoPago, cerradaPorId: usuarioId, cerradaEn: new Date() },
      include: incluirCuenta,
    });
  });
  avisar.cuentaCerrada({ restauranteId, cuentaId, mesa: existe.mesa }, cuenta.updatedAt);
  return aCuenta(cuenta);
}

export async function detalleCuenta(restauranteId: string, cuentaId: string) {
  const c = await prisma.cuenta.findFirst({
    where: { id: cuentaId, restauranteId },
    include: incluirCuenta,
  });
  if (!c) throw noExiste('Cuenta');
  return aCuenta(c);
}

// --- Llamadas ---

export const llamadas = (restauranteId: string, atendida?: boolean) =>
  prisma.llamada.findMany({
    where: { restauranteId, ...(atendida === undefined ? {} : { atendida }) },
    orderBy: { createdAt: 'asc' },
    include: { mesa: { select: { id: true, numero: true, nombre: true } } },
  });

export async function atenderLlamada(restauranteId: string, id: string) {
  const { count } = await prisma.llamada.updateMany({
    where: { id, restauranteId, atendida: false },
    data: { atendida: true },
  });
  if (count === 0) {
    if (!(await prisma.llamada.findFirst({ where: { id, restauranteId } })))
      throw noExiste('Llamada');
    throw invalida('La llamada ya fue atendida');
  }
  const llamada = await prisma.llamada.findUniqueOrThrow({ where: { id } });
  emitToRestaurant(restauranteId, 'meseros', 'llamada:atendida', {
    llamadaId: id,
    updatedAt: llamada.updatedAt.toISOString(),
  });
  return llamada;
}

// --- Consultas ---

export async function mesas(restauranteId: string): Promise<MesaOperacion[]> {
  const filas = await prisma.mesa.findMany({
    where: { restauranteId, activa: true },
    orderBy: { numero: 'asc' },
    include: {
      cuentas: {
        where: { estado: { not: 'CERRADA' } },
        select: {
          id: true,
          estado: true,
          total: true,
          abiertaEn: true,
          pedidos: { select: { estado: true } },
        },
      },
      llamadas: { where: { atendida: false }, select: { tipo: true } },
    },
  });
  return filas.map((m) => {
    const c = m.cuentas[0];
    const pedidos = c?.pedidos.filter((p) => p.estado !== 'CANCELADO') ?? [];
    const pendientes = pedidos.filter((p) => p.estado === 'PENDIENTE').length;
    // Una cuenta abierta solo por escanear el QR (sin pedidos ni llamadas) no ocupa la mesa.
    const estado: EstadoMesa = m.llamadas.some((l) => l.tipo === 'MESERO')
      ? 'LLAMADA'
      : c?.estado === 'PIDIO_CUENTA'
        ? 'PIDIO_CUENTA'
        : pendientes > 0
          ? 'PEDIDO_PENDIENTE'
          : pedidos.length > 0
            ? 'OCUPADA'
            : 'LIBRE';
    return {
      id: m.id,
      numero: m.numero,
      nombre: m.nombre,
      estado,
      cuenta:
        c && (pedidos.length > 0 || c.estado === 'PIDIO_CUENTA')
          ? {
              id: c.id,
              estado: c.estado,
              total: c.total,
              abiertaEn: c.abiertaEn.toISOString(),
              pedidosPendientes: pendientes,
            }
          : null,
      llamadasActivas: m.llamadas.length,
    };
  });
}

export async function pedidos(restauranteId: string, estado?: EstadoPedido) {
  const filas = await prisma.pedido.findMany({
    where: { restauranteId, ...(estado ? { estado } : {}), cuenta: { estado: { not: 'CERRADA' } } },
    orderBy: { createdAt: 'asc' },
    include: {
      ...incluirPedido,
      cuenta: { select: { id: true, mesa: { select: { numero: true, nombre: true } } } },
    },
  });
  return filas.map((p) => ({ ...aPedido(p), cuentaId: p.cuenta.id, mesa: p.cuenta.mesa }));
}

export async function estacionesVisibles(restauranteId: string, usuario: UsuarioToken) {
  const { estacionId } = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuario.id },
    select: { estacionId: true },
  });
  return prisma.estacion.findMany({
    where: { restauranteId, ...(usuario.rol === 'COCINA' && estacionId ? { id: estacionId } : {}) },
    orderBy: { nombre: 'asc' },
  });
}

// Pantalla de estación: ítems activos agrupados por pedido (más antiguo primero).
export async function itemsEstacion(
  restauranteId: string,
  usuario: UsuarioToken,
  estacionId: string,
): Promise<PedidoEstacion[]> {
  const visibles = await estacionesVisibles(restauranteId, usuario);
  if (!visibles.some((e) => e.id === estacionId)) {
    if (!(await prisma.estacion.findFirst({ where: { id: estacionId, restauranteId } })))
      throw noExiste('Estación');
    throw new HttpError(403, 'PROHIBIDO', 'No tiene acceso a esta estación');
  }
  const filtroItem = { estacionId, estado: { in: ITEMS_ACTIVOS }, cancelado: false };
  const filas = await prisma.pedido.findMany({
    where: {
      restauranteId,
      estado: 'CONFIRMADO',
      cuenta: { estado: { not: 'CERRADA' } },
      items: { some: filtroItem },
    },
    orderBy: { confirmadoEn: 'asc' },
    include: {
      items: { where: filtroItem, orderBy: { createdAt: 'asc' }, include: incluirItem },
      cuenta: { select: { mesa: { select: { numero: true, nombre: true } } } },
    },
  });
  return filas.map((p) => ({
    pedidoId: p.id,
    mesa: p.cuenta.mesa,
    confirmadoEn: (p.confirmadoEn ?? p.createdAt).toISOString(),
    nota: p.nota,
    items: p.items.map(aItem),
  }));
}

// Ítems por estado en todo el restaurante (el mesero usa LISTO para saber qué llevar).
export async function items(restauranteId: string, estado: EstadoItem = 'LISTO') {
  const filas = await prisma.pedidoItem.findMany({
    where: {
      estado,
      cancelado: false,
      pedido: { restauranteId, estado: 'CONFIRMADO', cuenta: { estado: { not: 'CERRADA' } } },
    },
    orderBy: { updatedAt: 'asc' },
    include: {
      ...incluirItem,
      pedido: {
        select: {
          id: true,
          cuentaId: true,
          cuenta: { select: { mesa: { select: { numero: true, nombre: true } } } },
        },
      },
    },
  });
  return filas.map((i) => ({
    ...aItem(i),
    pedidoId: i.pedido.id,
    cuentaId: i.pedido.cuentaId,
    mesa: i.pedido.cuenta.mesa,
  }));
}

// Pedido tomado por el mesero: se confirma solo y abre la cuenta si hace falta.
export async function pedidoDeMesero(
  restauranteId: string,
  usuarioId: string,
  mesaId: string,
  input: CrearPedidoInput,
) {
  const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, restauranteId, activa: true } });
  if (!mesa) throw noExiste('Mesa');
  const cuenta = await obtenerOCrearCuenta(restauranteId, mesaId);
  return crearPedido({ restauranteId, cuentaId: cuenta.id, origen: 'MESERO', usuarioId, input });
}
