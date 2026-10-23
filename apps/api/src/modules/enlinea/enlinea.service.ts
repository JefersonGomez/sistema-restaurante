import {
  estaAbierto,
  type EtapaEnLinea,
  type PedidoEnLineaInput,
  type SeguimientoEnLinea,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { generarTokenQr } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { emitToRestaurant } from '../../realtime';
import { cancelarPedido, cerrarEnTx, confirmarPedido } from '../operacion/operacion.service';
import { aCuenta, incluirCuenta, lugarDe } from '../pedidos/detalle';
import { bloquearCuenta, crearPedido, recalcularCuenta } from '../pedidos/pedidos.service';

// Cuántos pedidos sin aceptar puede tener a la vez un mismo teléfono (frena bromas y spam).
const MAX_PENDIENTES_POR_TELEFONO = 2;

// Al personal (sala y caja): un pedido en línea nuevo o que cambió.
const avisar = (restauranteId: string, evento: string, payload: object) => {
  emitToRestaurant(restauranteId, 'meseros', evento, payload);
  emitToRestaurant(restauranteId, 'caja', evento, payload);
};

// --- Cliente ---

export async function crear(slug: string, input: PedidoEnLineaInput) {
  const r = await prisma.restaurante.findUnique({
    where: { slug },
    include: { horarios: { select: { diaSemana: true, abre: true, cierra: true } } },
  });
  if (!r || !r.activo) throw noExiste('Restaurante');
  if (!r.enLineaActivo)
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
        direccionEntrega: input.tipo === 'DOMICILIO' ? input.cliente.direccion : null,
        referenciaEntrega: input.tipo === 'DOMICILIO' ? input.cliente.referencia || null : null,
        costoEnvio: input.tipo === 'DOMICILIO' ? r.costoEnvio : 0,
        pagoElegido: input.pago.metodo,
        comprobanteSinpe: input.pago.comprobante || null,
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
        },
      },
    },
  });
  if (!c) throw noExiste('Pedido');
  const { restaurante, ...cuenta } = c;
  return { restaurante, cuenta: aCuenta(cuenta) };
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
  return filas.map(aCuenta);
}

// Aceptar: el pedido pasa a cocina y el cliente ve el tiempo estimado.
export async function aceptar(
  restauranteId: string,
  usuarioId: string,
  id: string,
  tiempoEstimadoMin: number,
) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (c.etapa !== 'RECIBIDO') throw etapaInvalida('Este pedido ya se respondió');
  const pedido = c.pedidos.find((p) => p.estado === 'PENDIENTE');
  if (pedido) await confirmarPedido(restauranteId, usuarioId, pedido.id);
  await prisma.cuenta.update({ where: { id }, data: { etapa: 'ACEPTADO', tiempoEstimadoMin } });
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}

// Rechazar con motivo: el cliente lo ve en su seguimiento; la cuenta se cierra en cero.
export async function rechazar(
  restauranteId: string,
  usuarioId: string,
  id: string,
  motivo: string,
) {
  const c = await cuentaEnLinea(restauranteId, id);
  if (c.etapa !== 'RECIBIDO') throw etapaInvalida('Solo se rechaza un pedido sin aceptar');
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

export async function verificarPago(restauranteId: string, id: string) {
  await cuentaEnLinea(restauranteId, id);
  await prisma.cuenta.update({ where: { id }, data: { pagoVerificado: true } });
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
  await prisma.$transaction(async (tx) => {
    await bloquearCuenta(tx, id);
    await recalcularCuenta(tx, id);
    await cerrarEnTx(
      tx,
      { restauranteId, mesaId: null, cuentaId: id, usuarioId },
      { metodoPago, etapa: 'ENTREGADO' },
    );
  });
  avisar(restauranteId, 'enlinea:actualizado', { cuentaId: id });
  return detalle(id);
}
