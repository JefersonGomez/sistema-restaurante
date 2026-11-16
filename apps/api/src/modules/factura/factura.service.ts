import { descifrar } from '../../lib/cifrado';
import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import type { ConfigHacienda, Comprobante } from '../../generated/prisma/client';
import { clave, consecutivo, fechaCR, TIPO_DOC } from './clave';
import { abrirLlave, firmar, type Llave } from './firma';
import { consultar, enviar, ErrorHacienda, type Ambiente, type Credenciales } from './hacienda';
import { proveedorSistemas } from './identificacion';
import { construirXml, type DatosComprobante, type Identificacion } from './xml';

export type Receptor = {
  nombre: string;
  tipoId?: Identificacion['tipo'];
  numero?: string;
  correo?: string;
};

const MEDIO: Record<string, DatosComprobante['medios'][number]['tipo']> = {
  EFECTIVO: '01',
  TARJETA: '02',
  SINPE: '06',
};

// La llave .p12 se abre una vez por configuración (cambia si se actualiza la configuración).
const llaves = new Map<string, Promise<Llave>>();
function llaveDe(cfg: ConfigHacienda) {
  const k = `${cfg.id}:${cfg.updatedAt.getTime()}`;
  if (!llaves.has(k))
    llaves.set(
      k,
      abrirLlave(descifrar(cfg.llaveCifrada), descifrar(cfg.pinCifrado).toString('utf8')),
    );
  return llaves.get(k)!;
}
const credenciales = (cfg: ConfigHacienda, ambiente = cfg.ambiente): Credenciales => ({
  ambiente: ambiente as Ambiente,
  usuario: descifrar(cfg.usuarioCifrado).toString('utf8'),
  clave: descifrar(cfg.claveCifrada).toString('utf8'),
});

// Emite el comprobante de un cobro (cuenta completa o un grupo). Nunca lanza: si algo falla queda
// un comprobante en ERROR con el motivo, y el cobro sigue válido.
export async function emitirComprobante(o: {
  restauranteId: string;
  cuentaId: string;
  pagoId?: string;
  receptor?: Receptor;
  // Nota de crédito: anula por completo este comprobante (mismo cobro y mismo cliente).
  anula?: { comprobante: Comprobante; razon: string };
}) {
  const cfg = await prisma.configHacienda.findUnique({ where: { restauranteId: o.restauranteId } });
  if (!cfg?.activa) return null;

  const original = o.anula?.comprobante;
  if (original)
    o.receptor = original.receptorNombre
      ? {
          nombre: original.receptorNombre,
          tipoId: (original.receptorTipoId ?? undefined) as Receptor['tipoId'],
          numero: original.receptorNumero ?? undefined,
          correo: original.receptorCorreo ?? undefined,
        }
      : undefined;
  const esFactura = !!o.receptor?.numero && !!o.receptor.tipoId;
  const tipo = original ? ('NC' as const) : esFactura ? ('FE' as const) : ('TE' as const);
  const campo =
    tipo === 'NC' ? 'siguienteNota' : tipo === 'FE' ? 'siguienteFactura' : 'siguienteTiquete';
  const { [campo]: siguiente } = await prisma.configHacienda.update({
    where: { id: cfg.id },
    data: { [campo]: { increment: 1 } },
  });
  const numero = siguiente - 1;
  const ahora = new Date();
  const consec = consecutivo(
    tipo === 'NC' ? TIPO_DOC.NOTA_CREDITO : esFactura ? TIPO_DOC.FACTURA : TIPO_DOC.TIQUETE,
    numero,
    cfg.sucursal,
    cfg.terminal,
  );
  const laClave = clave({ fecha: ahora, identificacion: cfg.numeroId, consecutivo: consec });
  const base = {
    restauranteId: o.restauranteId,
    cuentaId: o.cuentaId,
    pagoId: o.pagoId ?? null,
    tipo,
    numero,
    consecutivo: consec,
    clave: laClave,
    fechaEmision: ahora,
    ambiente: cfg.ambiente,
    receptorNombre: o.receptor?.nombre ?? null,
    receptorTipoId: esFactura ? o.receptor!.tipoId! : null,
    receptorNumero: esFactura ? o.receptor!.numero! : null,
    receptorCorreo: o.receptor?.correo ?? null,
    referenciaId: original?.id ?? null,
    razon: o.anula?.razon ?? null,
  };

  try {
    const datos = await datosDelCobro(o);
    const { xml } = construirXml({
      ...datos.xml,
      tipo: base.tipo,
      clave: laClave,
      consecutivo: consec,
      fechaEmision: fechaCR(ahora).iso,
      proveedorSistemas: proveedorSistemas(),
      actividadEmisor: cfg.actividad,
      emisor: {
        nombre: cfg.nombre,
        identificacion: { tipo: cfg.tipoId as Identificacion['tipo'], numero: cfg.numeroId },
        nombreComercial: cfg.nombreComercial ?? undefined,
        ubicacion: {
          provincia: cfg.provincia,
          canton: cfg.canton,
          distrito: cfg.distrito,
          otrasSenas: cfg.otrasSenas,
        },
        correo: cfg.correo,
      },
      receptor: o.receptor?.nombre
        ? {
            nombre: o.receptor.nombre,
            identificacion: esFactura
              ? { tipo: o.receptor.tipoId!, numero: o.receptor.numero! }
              : undefined,
            correo: o.receptor.correo,
          }
        : undefined,
      referencia: original
        ? {
            tipoDoc: original.tipo === 'FE' ? '01' : '04',
            numero: original.clave,
            fecha: fechaCR(original.fechaEmision).iso,
            codigo: '01', // anula el documento de referencia
            razon: o.anula!.razon.slice(0, 180),
          }
        : undefined,
    });
    const xmlFirmado = await firmar(xml, await llaveDe(cfg));
    const c = await prisma.comprobante.create({
      data: { ...base, total: datos.total, xmlFirmado },
    });
    despertar();
    return c;
  } catch (e) {
    return prisma.comprobante.create({
      data: { ...base, total: 0, estado: 'ERROR', mensaje: (e as Error).message.slice(0, 500) },
    });
  }
}

// Líneas, cargos y medios de pago del cobro, desde lo que guardó la caja.
async function datosDelCobro(o: { cuentaId: string; pagoId?: string }): Promise<{
  total: number;
  xml: Omit<
    DatosComprobante,
    | 'tipo'
    | 'clave'
    | 'consecutivo'
    | 'fechaEmision'
    | 'proveedorSistemas'
    | 'actividadEmisor'
    | 'emisor'
    | 'receptor'
  >;
}> {
  const cuenta = await prisma.cuenta.findUniqueOrThrow({
    where: { id: o.cuentaId },
    include: {
      restaurante: {
        select: {
          porcentajeIva: true,
          preciosIncluyenImpuestos: true,
          cabysGeneral: true,
          moneda: true,
        },
      },
      lineasCobro: { where: { pagoId: null } },
    },
  });
  const pago = o.pagoId
    ? await prisma.pagoCuenta.findUniqueOrThrow({
        where: { id: o.pagoId },
        include: { lineas: true },
      })
    : null;
  const r = cuenta.restaurante;
  // Los pedidos en línea cuentan desde que se piden (igual que recalcularCuenta).
  const estados: ('CONFIRMADO' | 'PENDIENTE')[] =
    cuenta.tipo === 'MESA' ? ['CONFIRMADO'] : ['CONFIRMADO', 'PENDIENTE'];
  const items = await prisma.pedidoItem.findMany({
    where: {
      cancelado: false,
      pedido: { cuentaId: o.cuentaId, estado: { in: estados } },
      ...(o.pagoId ? { pagoId: o.pagoId } : {}),
    },
    include: { plato: { select: { nombreEs: true, cabys: true } }, modificadores: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!items.length) throw new Error('El cobro no tiene platos para facturar');
  const lineas = items.map((i) => {
    const cabys = i.plato.cabys ?? r.cabysGeneral;
    if (!cabys)
      throw new Error(
        'Falta el código CABYS general del restaurante (Ajustes → Factura electrónica)',
      );
    const extras = i.modificadores.map((m) => m.nombre).join(', ');
    return {
      cabys,
      detalle: extras ? `${i.plato.nombreEs} (${extras})` : i.plato.nombreEs,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      tarifaIva: i.tarifaIva ?? r.porcentajeIva,
    };
  });

  // Medios de pago: del detalle del cobro (Fase 13); si no hay, del método.
  const lineasCobro = pago ? pago.lineas : cuenta.lineasCobro;
  const metodo = pago ? pago.metodoPago : cuenta.metodoPago;
  const total = pago ? pago.total : cuenta.total;
  const porMedio = new Map<DatosComprobante['medios'][number]['tipo'], number>();
  for (const l of lineasCobro)
    porMedio.set(MEDIO[l.metodo] ?? '99', (porMedio.get(MEDIO[l.metodo] ?? '99') ?? 0) + l.monto);
  if (!porMedio.size) porMedio.set((metodo && MEDIO[metodo]) || '99', total);

  return {
    total,
    xml: {
      lineas,
      preciosIncluyenIva: r.preciosIncluyenImpuestos,
      servicio: pago ? pago.montoServicio : cuenta.montoServicio,
      envio: pago ? 0 : cuenta.costoEnvio,
      medios: [...porMedio].map(([tipo, monto]) => ({ tipo, monto })),
      moneda: r.moneda,
    },
  };
}

// --- Cola de envío ---

const MAX_ESPERA = 60 * 60_000;
const espera = (intentos: number) =>
  new Date(Date.now() + Math.min(30_000 * 2 ** intentos, MAX_ESPERA));

let corriendo = false;
// Envía los pendientes y consulta los enviados. La llama el servidor cada 30 s.
export async function procesarCola(limite = 20) {
  if (corriendo) return 0;
  corriendo = true;
  try {
    const lista = await prisma.comprobante.findMany({
      where: { estado: { in: ['PENDIENTE', 'ENVIADO'] }, proximoIntento: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: limite,
      include: { restaurante: { select: { configHacienda: true } } },
    });
    for (const c of lista) await procesarUno(c, c.restaurante.configHacienda);
    return lista.length;
  } finally {
    corriendo = false;
  }
}

async function procesarUno(c: Comprobante, cfg: ConfigHacienda | null) {
  const guardar = (data: Partial<Comprobante>) =>
    prisma.comprobante.update({ where: { id: c.id }, data });
  if (!cfg)
    return guardar({
      estado: 'ERROR',
      mensaje: 'El restaurante no tiene configuración de Hacienda',
    });
  try {
    const cred = credenciales(cfg, c.ambiente);
    if (c.estado === 'PENDIENTE') {
      await enviar(cred, {
        clave: c.clave,
        fecha: fechaCR(c.fechaEmision).iso,
        emisor: { tipo: cfg.tipoId, numero: cfg.numeroId },
        receptor:
          c.receptorTipoId && c.receptorNumero
            ? { tipo: c.receptorTipoId, numero: c.receptorNumero }
            : undefined,
        xmlFirmado: c.xmlFirmado!,
      });
      return guardar({
        estado: 'ENVIADO',
        intentos: 0,
        mensaje: null,
        proximoIntento: new Date(Date.now() + 5_000),
      });
    }
    const e = await consultar(cred, c.clave);
    if (e.estado === 'aceptado' || e.estado === 'rechazado')
      return guardar({
        estado: e.estado === 'aceptado' ? 'ACEPTADO' : 'RECHAZADO',
        mensaje: e.mensaje?.slice(0, 2000) ?? null,
        respuestaXml: e.respuestaXml ?? null,
      });
    // Si Hacienda no lo tiene, se vuelve a enviar.
    if (e.estado === 'no-encontrado')
      return guardar({ estado: 'PENDIENTE', proximoIntento: new Date() });
    return guardar({ intentos: c.intentos + 1, proximoIntento: espera(Math.min(c.intentos, 3)) });
  } catch (err) {
    const h = err instanceof ErrorHacienda ? err : null;
    // 400 al enviar = el comprobante no es válido: no tiene caso reintentar (salvo que ya lo tenga).
    if (h?.estado === 400 && c.estado === 'PENDIENTE') {
      if (/ya fue recibid|ya existe|duplicad/i.test(h.detalle ?? ''))
        return guardar({ estado: 'ENVIADO', proximoIntento: new Date() });
      return guardar({
        estado: 'ERROR',
        mensaje: `${h.message}: ${h.detalle ?? ''}`.slice(0, 500),
      });
    }
    // Red caída, Hacienda sin servicio o token vencido: se reintenta más tarde.
    return guardar({
      intentos: c.intentos + 1,
      proximoIntento: espera(c.intentos + 1),
      mensaje: (err as Error).message.slice(0, 500),
    });
  }
}

// Tras emitir, intenta enviarlo de una vez (fuera de los tests).
function despertar() {
  if (env.NODE_ENV === 'test') return;
  setImmediate(() => procesarCola().catch(() => {}));
}
