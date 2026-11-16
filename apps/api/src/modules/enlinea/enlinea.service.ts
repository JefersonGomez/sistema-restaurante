import {
  estaAbierto,
  incluyeEnLinea,
  normalizarTelefono,
  type EfectivoRepartidor,
  type EtapaEnLinea,
  type PedidoEnLineaInput,
  type SeguimientoEnLinea,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { generarTokenQr } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { emitToRestaurant } from '../../realtime';
import { emitirComprobante } from '../factura/factura.service';
import { cancelarPedido, cerrarEnTx, confirmarPedido } from '../operacion/operacion.service';
import { aCuenta, incluirCuenta, lugarDe } from '../pedidos/detalle';
import { bloquearCuenta, crearPedido, recalcularCuenta } from '../pedidos/pedidos.service';
import { fidelidadDe, sellosDe, sesionDe } from '../clientes/clientes.service';

// Cuántos pedidos sin aceptar puede tener a la vez un mismo teléfono (frena bromas y spam).
const MAX_PENDIENTES_POR_TELEFONO = 2;

// Al personal (sala, caja y repartidores): un pedido en línea nuevo o que cambió.
const avisar = (restauranteId: string, evento: string, payload: object) => {
  emitToRestaurant(restauranteId, 'meseros', evento, payload);
  emitToRestaurant(restauranteId, 'caja', evento, payload);
  emitToRestaurant(restauranteId, 'repartidores', evento, payload);
};

// --- Cliente ---

// tokenCliente: sesión de la cuenta del cliente (encabezado X-Cliente); si no sirve, pide como invitado.
export async function crear(slug: string, input: PedidoEnLineaInput, tokenCliente?: string) {
  const r = await prisma.restaurante.findUnique({
    where: { slug },
    include: { horarios: { select: { diaSemana: true, abre: true, cierra: true } } },
  });
  if (!r || !r.activo) throw noExiste('Restaurante');
  if (!r.enLineaActivo || !incluyeEnLinea(r.plan))
    throw new HttpError(409, 'EN_LINEA_INACTIVO', 'Este restaurante no recibe pedidos en línea');
  if (input.tipo === 'RECOGER' ? !r.enLineaRecoger : !r.enLineaDomicilio)
    throw new HttpError(
      409,
      'TIPO_NO_DISPONIBLE',
      input.tipo === 'RECOGER'
        ? 'Este restaurante no tiene pedidos para recoger'
        : 'Este restaurante no hace entregas a domicilio',
    );
  if (!estaAbierto(r.horarios, new Date(), r.zonaHoraria, r.cerradoManual))
    throw new HttpError(423, 'RESTAURANTE_CERRADO', 'El restaurante está cerrado en este momento');

  // Idempotencia: el mismo envío (reintento) devuelve el mismo seguimiento.
  const previo = await prisma.pedido.findFirst({
    where: {
      restauranteId: r.id,
      clientRequestId: input.clientRequestId,
      cuenta: { tipo: { not: 'MESA' } },
    },
    select: { cuenta: { select: { tokenSeguimiento: true } } },
  });
  if (previo?.cuenta.tokenSeguimiento) return { token: previo.cuenta.tokenSeguimiento };

  const pendientes = await prisma.cuenta.count({
    where: { restauranteId: r.id, clienteTelefono: input.cliente.telefono, etapa: 'RECIBIDO' },
  });
  if (pendientes >= MAX_PENDIENTES_POR_TELEFONO)
    throw new HttpError(
      429,
      'DEMASIADOS_PEDIDOS',
      'Ya tiene pedidos esperando confirmación. Espere a que el restaurante los acepte.',
    );

  const sesion = await sesionDe(slug, tokenCliente);
  const token = generarTokenQr();
  const cuenta = await prisma.$transaction(async (tx) => {
    // Número correlativo por restaurante ("Pedido #12"); el candado evita repetirlo.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${r.id}))`;
    const { _max } = await tx.cuenta.aggregate({
      where: { restauranteId: r.id },
      _max: { numeroPedido: true },
    });
    return tx.cuenta.create({
      data: {
        restauranteId: r.id,
        tipo: input.tipo,
        numeroPedido: (_max.numeroPedido ?? 0) + 1,
        clienteNombre: input.cliente.nombre,
        clienteTelefono: input.cliente.telefono,
        telefonoNormal: normalizarTelefono(input.cliente.telefono),
        clienteId: sesion?.clienteId ?? null,
        direccionEntrega: input.tipo === 'DOMICILIO' ? input.cliente.direccion : null,
        referenciaEntrega: input.tipo === 'DOMICILIO' ? input.cliente.referencia || null : null,
        latEntrega: input.tipo === 'DOMICILIO' ? (input.cliente.ubicacion?.lat ?? null) : null,
        lngEntrega: input.tipo === 'DOMICILIO' ? (input.cliente.ubicacion?.lng ?? null) : null,
        costoEnvio: input.tipo === 'DOMICILIO' ? r.costoEnvio : 0,
        pagoElegido: input.pago.metodo,
        comprobanteSinpe: input.pago.comprobante || null,
        pagarAntesDe:
          input.pago.metodo === 'SINPE' ? new Date(Date.now() + r.minutosPagoSinpe * 60_000) : null,
        etapa: 'RECIBIDO',
        tokenSeguimiento: token,
      },
    });
  });

  try {
    await crearPedido({
      restauranteId: r.id,
      cuentaId: cuenta.id,
      origen: 'CLIENTE',
      input: { clientRequestId: input.clientRequestId, nota: input.nota, items: input.items },
      enLinea: { minimo: r.pedidoMinimo },
    });
  } catch (e) {
    await prisma.cuenta.delete({ where: { id: cuenta.id } }); // plato no disponible, mínimo…
    throw e;
  }
  await prisma.$transaction((tx) => recalcularCuenta(tx, cuenta.id)); // el total, desde ya
  avisar(r.id, 'enlinea:nuevo', { cuentaId: cuenta.id, lugar: lugarDe({ ...cuenta, mesa: null }) });
  return { token };
}

export async function seguimiento(token: string): Promise<SeguimientoEnLinea> {
  const c = await prisma.cuenta.findUnique({
    where: { tokenSeguimiento: token },
    include: {
      ...incluirCuenta,
      restaurante: {
        select: {
          nombre: true,
          slug: true,
          logoUrl: true,
          colorAcento: true,
          telefono: true,
          moneda: true,
          sinpeNumero: true,
          sinpeNombre: true,
          porcentajeIva: true,
          preciosIncluyenImpuestos: true,
          id: true,
          fidelidadActiva: true,
          sellosMeta: true,
          premioFidelidad: true,
        },
      },
    },
  });
  if (!c) throw noExiste('Pedido');
  const {
    restaurante: { id: _id, fidelidadActiva, sellosMeta, premioFidelidad, ...restaurante },
    ...cuenta
  } = c;
  const fidelidad = await fidelidadDe(
    { id: c.restauranteId, fidelidadActiva, sellosMeta, premioFidelidad },
    c.telefonoNormal,
  );
  return { restaurante, cuenta: aCuenta(cuenta), fidelidad };
}

// --- Restaurante ---

async function cuentaEnLinea(restauranteId: string, id: string) {
  const c = await prisma.cuenta.findFirst({
    where: { id, restauranteId, tipo: { not: 'MESA' } },
    include: { pedidos: { select: { id: true, estado: true } } },
  });
  if (!c) throw noExiste('Pedido en línea');
  return c;
}
const etapaInvalida = (m: string) => new HttpError(409, 'TRANSICION_INVALIDA', m);

// Con SINPE el pedido no entra a cocina hasta que el restaurante verifica el pago.
const esperaSinpe = (c: { pagoElegido: string | null; pagoVerificado: boolean }) =>
  c.pagoElegido === 'SINPE' && !c.pagoVerificado;
const sinPago = () =>
  new HttpError(409, 'PAGO_SIN_VERIFICAR', 'Primero hay que verificar el pago por SINPE');

const detalle = async (id: string) =>
  aCuenta(await prisma.cuenta.findUniqueOrThrow({ where: { id }, include: incluirCuenta }));

// Activos (sin cerrar) y los cerrados de las últimas 12 horas, lo más nuevo primero.
export async function listar(restauranteId: string) {
  const filas = await prisma.cuenta.findMany({
    where: {
      restauranteId,
      tipo: { not: 'MESA' },
      OR: [
        { estado: { not: 'CERRADA' } },
        { cerradaEn: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
      ],
    },
    orderBy: { abiertaEn: 'desc' },
    take: 100,
    include: incluirCuenta,
  });
  // Sellos de cada cliente, para mostrar la tarjeta y el botón de canjear.
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  const sellos = r.fidelidadActiva
    ? await sellosDe(
        restauranteId,
        filas.map((f) => f.telefonoNormal ?? ''),
      )
    : new Map<string, number>();
  return filas.map((f) => {
    const c = aCuenta(f);
    if (c.enLinea && r.fidelidadActiva && f.telefonoNormal)
      c.enLinea.fidelidad = {
        sellos: sellos.get(f.telefonoNormal) ?? 0,
        meta: r.sellosMeta,
        premio: r.premioFidelidad ?? 'Un premio',
      };
    return c;
  });
}

// Aceptar: el pedido pasa a cocina (con SINPE, cuando se verifique el pago) y el cliente ve el
// tiempo estimado.
export async function aceptar(
  restauranteId: string,
  usuarioId: string,
  id: string,
  tiempoEstimadoMin: number,
) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (c.etapa !== 'RECIBIDO') throw etapaInvalida('Este pedido ya se respondió');
  const pedido = c.pedidos.find((p) => p.estado === 'PENDIENTE');
  if (pedido && !esperaSinpe(c)) await confirmarPedido(restauranteId, usuarioId, pedido.id);
  await prisma.cuenta.update({ where: { id }, data: { etapa: 'ACEPTADO', tiempoEstimadoMin } });
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}

// Rechazar con motivo (sin aceptar, o aceptado que nunca pagó el SINPE): el cliente lo ve en su
// seguimiento; la cuenta se cierra en cero.
export async function rechazar(
  restauranteId: string,
  usuarioId: string,
  id: string,
  motivo: string,
) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (c.etapa !== 'RECIBIDO' && !(c.etapa === 'ACEPTADO' && esperaSinpe(c)))
    throw etapaInvalida('Solo se rechaza un pedido sin aceptar o que espera el pago');
  for (const p of c.pedidos.filter((x) => x.estado === 'PENDIENTE'))
    await cancelarPedido(restauranteId, p.id, motivo);
  await prisma.cuenta.update({
    where: { id },
    data: {
      etapa: 'RECHAZADO',
      motivoRechazo: motivo,
      estado: 'CERRADA',
      cerradaEn: new Date(),
      cerradaPorId: usuarioId,
    },
  });
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}

const SIGUIENTE: Record<'LISTO' | 'EN_CAMINO', EtapaEnLinea[]> = {
  LISTO: ['ACEPTADO'],
  EN_CAMINO: ['LISTO'],
};

// "Listo para entregar" y "Salió a entregar" (solo a domicilio).
export async function cambiarEtapa(
  restauranteId: string,
  id: string,
  etapa: 'LISTO' | 'EN_CAMINO',
) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (esperaSinpe(c)) throw sinPago();
  if (etapa === 'EN_CAMINO' && c.tipo !== 'DOMICILIO')
    throw etapaInvalida('Solo los pedidos a domicilio salen a entregar');
  const { count } = await prisma.cuenta.updateMany({
    where: { id, etapa: { in: SIGUIENTE[etapa] } },
    data: { etapa },
  });
  if (!count) throw etapaInvalida(`No se puede pasar de ${c.etapa} a ${etapa}`);
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}

// Pago verificado: si el pedido ya estaba aceptado, recién ahora pasa a cocina.
export async function verificarPago(restauranteId: string, usuarioId: string, id: string) {
  const c = await cuentaEnLinea(restauranteId, id);
  const { count } = await prisma.cuenta.updateMany({
    where: { id, pagoVerificado: false },
    data: { pagoVerificado: true },
  });
  const pedido = c.pedidos.find((p) => p.estado === 'PENDIENTE');
  if (count && c.etapa === 'ACEPTADO' && pedido)
    await confirmarPedido(restauranteId, usuarioId, pedido.id);
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}

// Entregado y cobrado: se cierra la cuenta con el método de pago (y entra a los reportes).
export async function entregar(
  restauranteId: string,
  usuarioId: string,
  id: string,
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'SINPE',
) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (!['ACEPTADO', 'LISTO', 'EN_CAMINO'].includes(c.etapa ?? ''))
    throw etapaInvalida('Primero hay que aceptar el pedido');
  if (esperaSinpe(c)) throw sinPago();
  await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, id);
    await recalcularCuenta(tx, id);
    await cerrarEnTx(
      tx,
      { restauranteId, mesaId: null, cuentaId: id, usuarioId },
      { metodoPago, etapa: 'ENTREGADO' },
    );
  });
  await emitirComprobante({ restauranteId, cuentaId: id });
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}

// --- Repartidores (Fase 7) ---

// Para elegir a quién se le asigna una entrega.
export function repartidores(restauranteId: string) {
  return prisma.usuario.findMany({
    where: { restauranteId, rol: 'REPARTIDOR', activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
}

// Se asigna (o se cambia) mientras el pedido a domicilio no haya salido.
export async function asignarRepartidor(restauranteId: string, id: string, repartidorId: string) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (c.tipo !== 'DOMICILIO') throw etapaInvalida('Solo los pedidos a domicilio llevan repartidor');
  const repartidor = await prisma.usuario.findFirst({
    where: { id: repartidorId, restauranteId, rol: 'REPARTIDOR', activo: true },
    select: { id: true },
  });
  if (!repartidor) throw noExiste('Repartidor');
  const { count } = await prisma.cuenta.updateMany({
    where: { id, restauranteId, etapa: { in: ['ACEPTADO', 'LISTO'] } },
    data: { repartidorId },
  });
  if (!count) throw etapaInvalida('Se asigna después de aceptar y antes de que salga');
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  emitToRestaurant(restauranteId, 'repartidores', 'reparto:asignado', {
    cuentaId: id,
    repartidorId,
    lugar: lugarDe({ ...c, mesa: null }),
  });
  return detalle(id);
}

// Lo que ve el repartidor: sus entregas activas y las que cerró en las últimas 12 horas.
export async function misRepartos(restauranteId: string, repartidorId: string) {
  const filas = await prisma.cuenta.findMany({
    where: {
      restauranteId,
      repartidorId,
      tipo: 'DOMICILIO',
      OR: [
        { estado: { not: 'CERRADA' } },
        { cerradaEn: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
      ],
    },
    orderBy: { abiertaEn: 'asc' },
    include: incluirCuenta,
  });
  return filas.map(aCuenta);
}

// El repartidor solo toca sus propias entregas (las de otros: 404).
async function deRepartidor(restauranteId: string, repartidorId: string, id: string) {
  const c = await prisma.cuenta.findFirst({
    where: { id, restauranteId, repartidorId },
    select: { etapa: true },
  });
  if (!c) throw noExiste('Entrega');
  return c;
}

export async function salir(restauranteId: string, repartidorId: string, id: string) {
  const c = await deRepartidor(restauranteId, repartidorId, id);
  if (c.etapa === 'ACEPTADO') throw etapaInvalida('Cocina todavía no termina este pedido');
  return cambiarEtapa(restauranteId, id, 'EN_CAMINO');
}

export async function entregarReparto(
  restauranteId: string,
  repartidorId: string,
  id: string,
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'SINPE',
) {
  await deRepartidor(restauranteId, repartidorId, id);
  return entregar(restauranteId, repartidorId, id, metodoPago);
}

// Efectivo de entregas ya cobradas que el repartidor todavía no entregó en caja.
const sinCuadrar = (restauranteId: string) => ({
  restauranteId,
  tipo: 'DOMICILIO' as const,
  etapa: 'ENTREGADO' as const,
  metodoPago: 'EFECTIVO' as const,
  efectivoCuadrado: false,
});

export async function efectivoPorCuadrar(restauranteId: string): Promise<EfectivoRepartidor[]> {
  const grupos = await prisma.cuenta.groupBy({
    by: ['repartidorId'],
    where: { ...sinCuadrar(restauranteId), repartidorId: { not: null } },
    _sum: { total: true },
    _count: true,
  });
  const nombres = await prisma.usuario.findMany({
    where: { restauranteId, id: { in: grupos.map((g) => g.repartidorId!) } },
    select: { id: true, nombre: true },
  });
  return grupos
    .map((g) => ({
      repartidor: nombres.find((u) => u.id === g.repartidorId)!,
      pedidos: g._count,
      total: g._sum.total ?? 0,
    }))
    .sort((a, b) => a.repartidor.nombre.localeCompare(b.repartidor.nombre));
}

export async function recibirEfectivo(restauranteId: string, repartidorId: string) {
  const { count } = await prisma.cuenta.updateMany({
    where: { ...sinCuadrar(restauranteId), repartidorId },
    data: { efectivoCuadrado: true, efectivoRecibidoEn: new Date() }, // entra al turno de caja
  });
  return { pedidos: count };
}
