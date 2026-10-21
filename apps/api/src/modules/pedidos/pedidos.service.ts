import {
  calcularTotales,
  estaAbierto,
  minimoEfectivo,
  type CrearPedidoInput,
} from '@menu-qr/shared';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { aPedido, incluirPedido } from './detalle';
import * as avisar from './eventos';

type Tx = Prisma.TransactionClient;

const esUnico = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export const cuentaCerrada = () =>
  new HttpError(410, 'CUENTA_CERRADA', 'La cuenta ya se cerró. ¡Gracias por su visita!');

// Bloquea la fila de la cuenta hasta el fin de la transacción: serializa pedidos, cambios de
// totales y el cierre de una misma cuenta.
export const bloquearCuenta = (tx: Tx, cuentaId: string) =>
  tx.$queryRaw`SELECT id FROM "Cuenta" WHERE id = ${cuentaId}::uuid FOR UPDATE`;

// Devuelve la cuenta no cerrada de la mesa o crea una. El índice único parcial
// `cuenta_unica_abierta` garantiza una sola aunque lleguen dos solicitudes a la vez.
export async function obtenerOCrearCuenta(restauranteId: string, mesaId: string) {
  const buscar = () =>
    prisma.cuenta.findFirst({ where: { restauranteId, mesaId, estado: { not: 'CERRADA' } } });
  const existente = await buscar();
  if (existente) return existente;
  try {
    return await prisma.cuenta.create({ data: { restauranteId, mesaId } });
  } catch (e) {
    if (!esUnico(e)) throw e;
    const ganadora = await buscar();
    if (!ganadora) throw e;
    return ganadora;
  }
}

// Recalcula y guarda los totales: solo pedidos CONFIRMADOS y sin ítems cancelados.
export async function recalcularCuenta(tx: Tx, cuentaId: string) {
  const cuenta = await tx.cuenta.findUniqueOrThrow({
    where: { id: cuentaId },
    include: {
      restaurante: {
        select: { porcentajeIva: true, porcentajeServicio: true, preciosIncluyenImpuestos: true },
      },
    },
  });
  const lineas = await tx.pedidoItem.findMany({
    where: { pedido: { cuentaId, estado: 'CONFIRMADO' } },
    select: { precioUnitario: true, cantidad: true, cancelado: true },
  });
  return tx.cuenta.update({
    where: { id: cuentaId },
    data: calcularTotales(lineas, cuenta.restaurante),
  });
}

type PlatoConGrupos = Prisma.PlatoGetPayload<{
  include: {
    categoria: { select: { activa: true } };
    grupos: { include: { modificadores: true } };
  };
}>;

// Valida disponibilidad y modificadores; el precio sale de la BD, nunca del cliente.
function prepararItem(plato: PlatoConGrupos | undefined, platoId: string, modIds: string[]) {
  if (!plato || !plato.activo || !plato.categoria.activa)
    throw new HttpError(409, 'PLATO_NO_DISPONIBLE', 'Un plato ya no está disponible', {
      platoId,
      motivo: 'no_disponible',
    });
  if (plato.agotado)
    throw new HttpError(409, 'PLATO_NO_DISPONIBLE', `«${plato.nombreEs}» está agotado`, {
      platoId,
      motivo: 'agotado',
    });

  const elegidos = new Set(modIds);
  const usados: { modificadorId: string; nombre: string; precioExtra: number }[] = [];
  for (const g of plato.grupos) {
    const delGrupo = g.modificadores.filter((m) => elegidos.has(m.id));
    const minimo = minimoEfectivo(g);
    if (delGrupo.length < minimo || delGrupo.length > g.maximo)
      throw new HttpError(
        400,
        'MODIFICADORES_INVALIDOS',
        `«${g.nombreEs}»: elija entre ${minimo} y ${g.maximo}`,
        {
          platoId,
          grupoId: g.id,
          minimo,
          maximo: g.maximo,
          elegidos: delGrupo.length,
        },
      );
    for (const m of delGrupo) {
      usados.push({ modificadorId: m.id, nombre: m.nombreEs, precioExtra: m.precioExtra });
      elegidos.delete(m.id);
    }
  }
  if (elegidos.size > 0)
    throw new HttpError(
      400,
      'MODIFICADORES_INVALIDOS',
      'Hay modificadores que no son de este plato',
      {
        platoId,
        modificadores: [...elegidos],
      },
    );

  const precioUnitario = plato.precio + usados.reduce((s, m) => s + m.precioExtra, 0);
  return { estacionId: plato.estacionId, precioUnitario, modificadores: usados };
}

type NuevoPedido = {
  restauranteId: string;
  cuentaId: string;
  origen: 'CLIENTE' | 'MESERO';
  usuarioId?: string;
  input: CrearPedidoInput;
};

const buscarPorRequest = (cuentaId: string, clientRequestId: string) =>
  prisma.pedido.findUnique({
    where: { cuentaId_clientRequestId: { cuentaId, clientRequestId } },
    include: incluirPedido,
  });

export async function crearPedido(p: NuevoPedido) {
  // Idempotencia: el mismo clientRequestId en la misma cuenta devuelve el pedido ya creado.
  const previo = await buscarPorRequest(p.cuentaId, p.input.clientRequestId);
  if (previo) return { pedido: aPedido(previo), creado: false };

  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      await bloquearCuenta(tx, p.cuentaId);
      const cuenta = await tx.cuenta.findFirst({
        where: { id: p.cuentaId, restauranteId: p.restauranteId },
        include: {
          mesa: { select: { numero: true } },
          restaurante: { select: { modoConfirmacion: true, horaApertura: true, horaCierre: true } },
        },
      });
      if (!cuenta) throw noExiste('Cuenta');
      if (cuenta.estado === 'CERRADA') throw cuentaCerrada();
      // Fuera de horario el comensal no puede pedir; el mesero sí (p. ej. últimos pedidos).
      const { horaApertura, horaCierre } = cuenta.restaurante;
      if (p.origen === 'CLIENTE' && !estaAbierto(horaApertura, horaCierre))
        throw new HttpError(
          409,
          'RESTAURANTE_CERRADO',
          `El restaurante atiende de ${horaApertura} a ${horaCierre}`,
        );

      const ids = [...new Set(p.input.items.map((i) => i.platoId))];
      const platos = await tx.plato.findMany({
        where: { id: { in: ids }, restauranteId: p.restauranteId },
        include: {
          categoria: { select: { activa: true } },
          grupos: { include: { modificadores: true } },
        },
      });
      const porId = new Map(platos.map((x) => [x.id, x]));
      const items = p.input.items.map((i) => {
        const { estacionId, precioUnitario, modificadores } = prepararItem(
          porId.get(i.platoId),
          i.platoId,
          i.modificadores,
        );
        return {
          platoId: i.platoId,
          estacionId,
          cantidad: i.cantidad,
          notas: i.notas || null,
          precioUnitario,
          modificadores: { create: modificadores },
        };
      });

      // Mesero: confirmado directo. Comensal: según modoConfirmacion del restaurante.
      const modo = cuenta.restaurante.modoConfirmacion;
      const confirmado =
        p.origen === 'MESERO' ||
        modo === 'NUNCA' ||
        (modo === 'PRIMER_PEDIDO' && cuenta.verificada);
      const ahora = new Date();

      const pedido = await tx.pedido.create({
        data: {
          restauranteId: p.restauranteId,
          cuentaId: p.cuentaId,
          origen: p.origen,
          clientRequestId: p.input.clientRequestId,
          creadoPorUsuarioId: p.usuarioId ?? null,
          nota: p.input.nota || null,
          estado: confirmado ? 'CONFIRMADO' : 'PENDIENTE',
          confirmadoEn: confirmado ? ahora : null,
          confirmadoPorId: p.origen === 'MESERO' ? p.usuarioId : null,
          items: { create: items },
        },
        include: incluirPedido,
      });

      if (p.origen === 'MESERO' && !cuenta.verificada)
        await tx.cuenta.update({ where: { id: cuenta.id }, data: { verificada: true } });
      const cuentaFinal = confirmado ? await recalcularCuenta(tx, cuenta.id) : null;
      return { pedido: aPedido(pedido), cuentaFinal, mesa: cuenta.mesa };
    });
  } catch (e) {
    // Dos envíos simultáneos del mismo clientRequestId: gana uno, el otro lo devuelve.
    if (esUnico(e)) {
      const ganador = await buscarPorRequest(p.cuentaId, p.input.clientRequestId);
      if (ganador) return { pedido: aPedido(ganador), creado: false };
    }
    throw e;
  }

  const ctx = { restauranteId: p.restauranteId, cuentaId: p.cuentaId, mesa: resultado.mesa };
  if (resultado.pedido.estado === 'PENDIENTE') avisar.pedidoNuevo(ctx, resultado.pedido);
  else avisar.pedidoConfirmado(ctx, resultado.pedido);
  if (resultado.cuentaFinal) avisar.cuentaActualizada(ctx, resultado.cuentaFinal);
  return { pedido: resultado.pedido, creado: true };
}
