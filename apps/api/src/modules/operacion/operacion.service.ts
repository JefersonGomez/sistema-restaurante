import type {
  CerrarCuentaInput,
  CobrarParteInput,
  CrearPedidoInput,
  EstadoItem,
  EstadoMesa,
  EstadoPedido,
  LineaCobroInput,
  MesaOperacion,
  PedidoEstacion,
} from '@menu-qr/shared';
import { calcularTotales } from '@menu-qr/shared';
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import type { UsuarioToken } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import {
  aCuenta,
  aItem,
  aPedido,
  datosLugar,
  incluirCuenta,
  incluirItem,
  incluirPedido,
  lugarDe,
} from '../pedidos/detalle';
import { emitirComprobante } from '../factura/factura.service';
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
    select: { cuentaId: true, cuenta: { select: datosLugar } },
  });
  if (!p) throw noExiste('Pedido');
  return { restauranteId, cuentaId: p.cuentaId, mesa: p.cuenta.mesa, lugar: lugarDe(p.cuenta) };
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
// Margen del servidor para "deshacer" (la pantalla lo ofrece 5 s; se tolera la demora de red).
const DESHACER_SEG = 15;
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
          cuenta: { select: { estado: true, ...datosLugar } },
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
  deshacer = false, // vuelve de `estado` al anterior (toque equivocado, hasta DESHACER_SEG después)
) {
  const item = await itemDelRestaurante(restauranteId, itemId);

  // Cocina prepara y también entrega en la barra (solo su estación si tiene una asignada); el
  // mesero entrega; el dueño todo.
  if (usuario.rol === 'COCINA') {
    const estacionId = await estacionDe(usuario);
    if (estacionId && estacionId !== item.estacionId)
      throw new HttpError(403, 'PROHIBIDO', 'El ítem es de otra estación');
  }
  if (usuario.rol === 'MESERO' && estado !== 'ENTREGADO')
    throw new HttpError(403, 'PROHIBIDO', 'El mesero solo marca entregas');

  if (item.pedido.estado !== 'CONFIRMADO') throw invalida('El pedido no está confirmado');
  if (item.pedido.cuenta.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');

  // Transición atómica: solo avanza si sigue en el estado anterior (evita dobles toques).
  const marca = MARCA_TIEMPO[estado];
  const { count } = deshacer
    ? await prisma.pedidoItem.updateMany({
        where: {
          id: itemId,
          estado,
          cancelado: false,
          [marca]: { gte: new Date(Date.now() - DESHACER_SEG * 1000) },
        },
        data: { estado: ANTERIOR[estado], [marca]: null },
      })
    : await prisma.pedidoItem.updateMany({
        where: { id: itemId, estado: ANTERIOR[estado], cancelado: false },
        data: { estado, [marca]: new Date() },
      });
  if (count === 0)
    throw invalida(
      deshacer
        ? 'Ya no se puede deshacer'
        : `No se puede pasar de ${item.cancelado ? 'CANCELADO' : item.estado} a ${estado}`,
    );

  const final = await prisma.pedidoItem.findUniqueOrThrow({
    where: { id: itemId },
    include: incluirItem,
  });
  const detalle = aItem(final);
  avisar.itemEstado(
    {
      restauranteId,
      cuentaId: item.pedido.cuentaId,
      mesa: item.pedido.cuenta.mesa,
      lugar: lugarDe(item.pedido.cuenta),
    },
    { ...detalle, pedidoId: item.pedidoId },
  );
  return detalle;
}

// Cocina: "Listo · avisar mesero". Solo con todos los platos (de su estación, si tiene una) listos;
// la primera vez fija la hora (desde ahí se mide la espera en "Listos") y avisa al personal.
export async function avisarListo(restauranteId: string, usuario: UsuarioToken, pedidoId: string) {
  const p = await prisma.pedido.findFirst({
    where: { id: pedidoId, restauranteId },
    select: {
      estado: true,
      cuentaId: true,
      cuenta: { select: { estado: true, ...datosLugar } },
      items: { where: { cancelado: false }, select: { estado: true, estacionId: true } },
    },
  });
  if (!p) throw noExiste('Pedido');
  if (p.estado !== 'CONFIRMADO') throw invalida('El pedido no está confirmado');
  const estacionId = usuario.rol === 'COCINA' ? await estacionDe(usuario) : null;
  const suyos = p.items.filter((i) => !estacionId || i.estacionId === estacionId);
  if (!suyos.length || suyos.some((i) => i.estado !== 'LISTO' && i.estado !== 'ENTREGADO'))
    throw invalida('Todavía hay platos sin terminar');
  const ahora = new Date();
  await prisma.pedido.updateMany({
    where: { id: pedidoId, restauranteId, listoAvisadoEn: null },
    data: { listoAvisadoEn: ahora },
  });
  avisar.pedidoListo(
    { restauranteId, cuentaId: p.cuentaId, mesa: p.cuenta.mesa, lugar: lugarDe(p.cuenta) },
    pedidoId,
    p.cuenta.tipo,
    ahora.toISOString(),
  );
  return { listoAvisadoEn: ahora.toISOString() };
}

const ORDEN: EstadoItem[] = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO'];

// Cocina: avanza varios platos de un pedido hasta `estado` ("Empezar", "Marcar todo listo",
// "Entregado"), pasando por los estados intermedios con su marca de tiempo. Cocina con estación
// asignada solo mueve los de su estación; el mesero solo entrega.
export async function avanzarPedido(
  restauranteId: string,
  usuario: UsuarioToken,
  pedidoId: string,
  estado: 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO',
  itemIds?: string[],
) {
  if (usuario.rol === 'MESERO' && estado !== 'ENTREGADO')
    throw new HttpError(403, 'PROHIBIDO', 'El mesero solo marca entregas');
  const p = await prisma.pedido.findFirst({
    where: { id: pedidoId, restauranteId },
    select: { estado: true, cuentaId: true, cuenta: { select: { estado: true, ...datosLugar } } },
  });
  if (!p) throw noExiste('Pedido');
  if (p.estado !== 'CONFIRMADO') throw invalida('El pedido no está confirmado');
  if (p.cuenta.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');

  const estacionId = usuario.rol === 'COCINA' ? await estacionDe(usuario) : null;
  const where = {
    pedidoId,
    cancelado: false,
    ...(itemIds && { id: { in: itemIds } }),
    ...(estacionId && { estacionId }),
  };
  const meta = ORDEN.indexOf(estado);
  const antes = await prisma.pedidoItem.findMany({ where, select: { id: true, estado: true } });
  const mover = antes.filter((i) => ORDEN.indexOf(i.estado) < meta).map((i) => i.id);
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    // Paso a paso: cada updateMany solo toma los que siguen en el estado anterior.
    for (let paso = 1; paso <= meta; paso++) {
      const destino = ORDEN[paso] as keyof typeof MARCA_TIEMPO;
      await tx.pedidoItem.updateMany({
        where: { ...where, id: { in: mover }, estado: ORDEN[paso - 1] },
        data: { estado: destino, [MARCA_TIEMPO[destino]]: ahora },
      });
    }
  });

  const finales = await prisma.pedidoItem.findMany({
    where: { id: { in: mover } },
    include: incluirItem,
  });
  const ctx = {
    restauranteId,
    cuentaId: p.cuentaId,
    mesa: p.cuenta.mesa,
    lugar: lugarDe(p.cuenta),
  };
  for (const i of finales) avisar.itemEstado(ctx, { ...aItem(i), pedidoId });
  return { movidos: finales.length };
}

// Se puede cancelar mientras no esté LISTO; requiere motivo.
export async function cancelarItem(restauranteId: string, itemId: string, motivo: string) {
  const item = await itemDelRestaurante(restauranteId, itemId);
  const ctx = {
    restauranteId,
    cuentaId: item.pedido.cuentaId,
    mesa: item.pedido.cuenta.mesa,
    lugar: lugarDe(item.pedido.cuenta),
  };
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

// Pasos comunes al cerrar: la sesión del comensal deja de servir y la mesa queda libre.
export async function cerrarEnTx(
  tx: Prisma.TransactionClient,
  c: { restauranteId: string; mesaId: string | null; cuentaId: string; usuarioId: string },
  data: Prisma.CuentaUpdateInput,
) {
  await tx.sesionCliente.updateMany({ where: { cuentaId: c.cuentaId }, data: { revocada: true } });
  if (c.mesaId)
    await tx.llamada.updateMany({
      where: { restauranteId: c.restauranteId, mesaId: c.mesaId, atendida: false },
      data: { atendida: true },
    });
  return tx.cuenta.update({
    where: { id: c.cuentaId },
    data: {
      ...data,
      estado: 'CERRADA',
      cerradaPor: { connect: { id: c.usuarioId } },
      cerradaEn: new Date(),
    },
    include: incluirCuenta,
  });
}

// Detalle del cobro (Fase 13): las líneas deben sumar exactamente lo cobrado.
async function guardarLineas(
  tx: Prisma.TransactionClient,
  cuentaId: string,
  pagoId: string | null,
  total: number,
  lineas: LineaCobroInput[] | undefined,
) {
  if (!lineas) return;
  if (lineas.reduce((n, l) => n + l.monto, 0) !== total)
    throw new HttpError(
      422,
      'COBRO_NO_CUADRA',
      'El detalle del pago no suma el total: revise los montos',
    );
  await tx.lineaCobro.createMany({
    data: lineas.map((l) => ({
      cuentaId,
      pagoId,
      metodo: l.metodo,
      monto: l.monto,
      recibido: l.recibido ?? null,
      vuelto: l.recibido ? l.recibido - l.monto : 0,
      ultimos4: l.ultimos4 ?? null,
      autorizacion: l.autorizacion ?? null,
      comprobante: l.comprobante ?? null,
    })),
  });
}

export async function cerrarCuenta(
  restauranteId: string,
  usuarioId: string,
  cuentaId: string,
  { metodoPago, lineas, receptor }: CerrarCuentaInput,
) {
  const existe = await prisma.cuenta.findFirst({
    where: { id: cuentaId, restauranteId },
    select: { mesaId: true, ...datosLugar },
  });
  if (!existe) throw noExiste('Cuenta');

  const cuenta = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, cuentaId);
    const actual = await tx.cuenta.findUniqueOrThrow({ where: { id: cuentaId } });
    if (actual.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');
    const pendientes = await tx.pedido.count({ where: { cuentaId, estado: 'PENDIENTE' } });
    if (pendientes > 0)
      throw new HttpError(409, 'PEDIDOS_PENDIENTES', 'Hay pedidos sin confirmar o cancelar');
    if (await tx.pagoCuenta.count({ where: { cuentaId } }))
      throw new HttpError(
        409,
        'PAGO_SEPARADO',
        'Esta cuenta se está pagando por separado: cobre lo que falta como otro grupo',
      );
    const { total } = await recalcularCuenta(tx, cuentaId);
    await guardarLineas(tx, cuentaId, null, total, lineas);
    return cerrarEnTx(
      tx,
      { restauranteId, mesaId: existe.mesaId, cuentaId, usuarioId },
      { metodoPago },
    );
  });
  avisar.cuentaCerrada(
    { restauranteId, cuentaId, mesa: existe.mesa, lugar: lugarDe(existe) },
    cuenta.updatedAt,
  );
  await emitirComprobante({ restauranteId, cuentaId, receptor }); // factura electrónica (si está activa)
  return aCuenta(cuenta);
}

// Cuenta separada: cobra un grupo de ítems. Si se cobra una parte de un ítem con cantidad > 1, el
// ítem se divide en dos filas (la cobrada y el resto). Al cobrar lo último, la cuenta se cierra con
// el total igual a la suma de los grupos.
export async function cobrarParte(
  restauranteId: string,
  usuarioId: string,
  cuentaId: string,
  { nombre, metodoPago, lineas, receptor, items }: CobrarParteInput,
) {
  const existe = await prisma.cuenta.findFirst({
    where: { id: cuentaId, restauranteId },
    select: {
      mesaId: true,
      ...datosLugar,
      restaurante: {
        select: { porcentajeIva: true, porcentajeServicio: true, preciosIncluyenImpuestos: true },
      },
    },
  });
  if (!existe) throw noExiste('Cuenta');

  const { cuenta, cerrada, pagoId } = await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, cuentaId);
    const actual = await tx.cuenta.findUniqueOrThrow({ where: { id: cuentaId } });
    if (actual.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');
    if (await tx.pedido.count({ where: { cuentaId, estado: 'PENDIENTE' } }))
      throw new HttpError(409, 'PEDIDOS_PENDIENTES', 'Hay pedidos sin confirmar o cancelar');

    const cobrados: {
      id: string;
      precioUnitario: number;
      cantidad: number;
      tarifaIva: number | null;
    }[] = [];
    for (const { itemId, cantidad } of items) {
      const item = await tx.pedidoItem.findFirst({
        where: {
          id: itemId,
          pagoId: null,
          cancelado: false,
          pedido: { cuentaId, estado: 'CONFIRMADO' },
        },
        include: { modificadores: true },
      });
      if (!item) throw invalida('Un plato ya se cobró o no es de esta cuenta');
      if (cantidad > item.cantidad)
        throw invalida(`De ${item.cantidad} no se pueden cobrar ${cantidad}`);
      if (cantidad === item.cantidad) {
        cobrados.push({ ...item, cantidad });
        continue;
      }
      // Parte de un ítem: la fila original queda con el resto y se crea otra con lo cobrado.
      await tx.pedidoItem.update({
        where: { id: item.id },
        data: { cantidad: item.cantidad - cantidad },
      });
      const { id: _id, modificadores, createdAt: _c, updatedAt: _u, ...copia } = item;
      const parte = await tx.pedidoItem.create({
        data: {
          ...copia,
          cantidad,
          modificadores: {
            create: modificadores.map((m) => ({
              modificadorId: m.modificadorId,
              nombre: m.nombre,
              precioExtra: m.precioExtra,
            })),
          },
        },
      });
      cobrados.push({ ...parte, cantidad });
    }

    const pago = await tx.pagoCuenta.create({
      data: {
        cuentaId,
        nombre: nombre || null,
        metodoPago,
        cobradoPorId: usuarioId,
        ...calcularTotales(cobrados, existe.restaurante),
      },
    });
    await guardarLineas(tx, cuentaId, pago.id, pago.total, lineas);
    await tx.pedidoItem.updateMany({
      where: { id: { in: cobrados.map((c) => c.id) } },
      data: { pagoId: pago.id },
    });

    const faltan = await tx.pedidoItem.count({
      where: { pagoId: null, cancelado: false, pedido: { cuentaId, estado: 'CONFIRMADO' } },
    });
    if (faltan) {
      const c = await tx.cuenta.findUniqueOrThrow({
        where: { id: cuentaId },
        include: incluirCuenta,
      });
      return { cuenta: c, cerrada: false, pagoId: pago.id };
    }
    // Se cobró todo: el total de la cuenta es lo que efectivamente se cobró.
    const pagos = await tx.pagoCuenta.findMany({ where: { cuentaId } });
    const suma = (k: 'subtotal' | 'montoServicio' | 'montoIva' | 'total') =>
      pagos.reduce((n, p) => n + p[k], 0);
    const metodos = new Set(pagos.map((p) => p.metodoPago));
    const c = await cerrarEnTx(
      tx,
      { restauranteId, mesaId: existe.mesaId, cuentaId, usuarioId },
      {
        subtotal: suma('subtotal'),
        montoServicio: suma('montoServicio'),
        montoIva: suma('montoIva'),
        total: suma('total'),
        metodoPago: metodos.size === 1 ? pago.metodoPago : 'MIXTO',
      },
    );
    return { cuenta: c, cerrada: true, pagoId: pago.id };
  });

  await emitirComprobante({ restauranteId, cuentaId, pagoId, receptor }); // uno por grupo
  const ctx = { restauranteId, cuentaId, mesa: existe.mesa, lugar: lugarDe(existe) };
  if (cerrada) avisar.cuentaCerrada(ctx, cuenta.updatedAt);
  else avisar.cuentaActualizada(ctx, cuenta);
  return { cuenta: aCuenta(cuenta), pagoId, cerrada };
}

// Deshacer un grupo cobrado por error (mientras la cuenta siga abierta).
export async function deshacerPago(restauranteId: string, cuentaId: string, pagoId: string) {
  const pago = await prisma.pagoCuenta.findFirst({
    where: { id: pagoId, cuenta: { id: cuentaId, restauranteId } },
    include: { cuenta: { select: { estado: true } } },
  });
  if (!pago) throw noExiste('Pago');
  if (pago.cuenta.estado === 'CERRADA') throw invalida('La cuenta ya está cerrada');
  await prisma.pagoCuenta.delete({ where: { id: pago.id } }); // los ítems quedan sin pagar
  return detalleCuenta(restauranteId, cuentaId);
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
          numeroComensales: true,
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
              personas: c.numeroComensales,
            }
          : null,
      llamadasActivas: m.llamadas.length,
    };
  });
}

export async function pedidos(restauranteId: string, estado?: EstadoPedido) {
  const filas = await prisma.pedido.findMany({
    where: {
      restauranteId,
      ...(estado ? { estado } : {}),
      cuenta: { estado: { not: 'CERRADA' }, tipo: 'MESA' },
    },
    orderBy: { createdAt: 'asc' },
    include: { ...incluirPedido, cuenta: { select: { id: true, ...datosLugar } } },
  });
  return filas.map((p) => ({
    ...aPedido(p),
    cuentaId: p.cuenta.id,
    mesa: p.cuenta.mesa!,
    lugar: lugarDe(p.cuenta),
  }));
}

// En una tablet vinculada manda la estación del dispositivo; si no, la asignada al usuario.
async function estacionDe(usuario: UsuarioToken) {
  if (usuario.estacionId) return usuario.estacionId;
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id: usuario.id },
    select: { estacionId: true },
  });
  return u.estacionId;
}

export async function estacionesVisibles(restauranteId: string, usuario: UsuarioToken) {
  const estacionId = await estacionDe(usuario);
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
      cuenta: { select: datosLugar },
      creadoPor: { select: { nombre: true } },
      confirmadoPor: { select: { nombre: true } },
    },
  });
  return filas.map((p) => ({
    pedidoId: p.id,
    mesa: p.cuenta.mesa,
    lugar: lugarDe(p.cuenta),
    canal: p.cuenta.tipo,
    numero: p.cuenta.numeroPedido,
    atendio: p.creadoPor?.nombre ?? p.confirmadoPor?.nombre ?? null,
    listoAvisadoEn: p.listoAvisadoEn?.toISOString() ?? null,
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
      pedido: {
        restauranteId,
        estado: 'CONFIRMADO',
        cuenta: { estado: { not: 'CERRADA' }, tipo: 'MESA' },
      },
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
