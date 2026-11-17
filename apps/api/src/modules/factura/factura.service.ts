import { descifrar } from '../../lib/cifrado';
import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import type { ConfigHacienda, Comprobante, Prisma } from '../../generated/prisma/client';
import { clave, consecutivo, fechaCR, TIPO_DOC } from './clave';
import { enviarComprobantePorCorreo } from './correo-comprobante';
import { abrirLlave, firmar, type Llave } from './firma';
import { consultar, enviar, ErrorHacienda, type Ambiente, type Credenciales } from './hacienda';
import { proveedorSistemas } from './identificacion';
import { calcularLinea, construirXml, type DatosComprobante, type Identificacion } from './xml';

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
  // Nota de crédito sobre este comprobante (mismo cobro y mismo cliente). Sin `lineas` anula todo
  // (código 01); con `lineas` acredita solo esas unidades (06 devolución, 14 error de monto).
  anula?: {
    comprobante: Comprobante;
    razon: string;
    codigo?: '01' | '06' | '14';
    lineas?: LineaNota[];
  };
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
    lineasNota: o.anula?.lineas
      ? { codigo: o.anula.codigo ?? '14', lineas: o.anula.lineas }
      : undefined,
  };

  try {
    const datos = await datosDelCobro(o, o.anula?.lineas);
    const { xml, totalComprobante } = construirXml({
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
            codigo: o.anula!.codigo ?? '01', // 01 anula todo; 06 devolución; 14 error de monto
            razon: o.anula!.razon.slice(0, 180),
          }
        : undefined,
    });
    const xmlFirmado = await firmar(xml, await llaveDe(cfg));
    const c = await prisma.comprobante.create({
      // En una nota parcial el total es el de las líneas acreditadas.
      data: { ...base, total: datos.total ?? Math.round(totalComprobante / 1000), xmlFirmado },
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
async function datosDelCobro(
  o: { cuentaId: string; pagoId?: string },
  parcial?: LineaNota[],
): Promise<{
  total: number | null; // null en nota parcial: sale de las líneas acreditadas
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
  const lineas = await lineasDelCobro(o, cuenta.tipo, r);

  // Medios de pago: del detalle del cobro (Fase 13); si no hay, del método.
  const lineasCobro = pago ? pago.lineas : cuenta.lineasCobro;
  const metodo = pago ? pago.metodoPago : cuenta.metodoPago;
  const total = pago ? pago.total : cuenta.total;
  const porMedio = new Map<DatosComprobante['medios'][number]['tipo'], number>();
  for (const l of lineasCobro)
    porMedio.set(MEDIO[l.metodo] ?? '99', (porMedio.get(MEDIO[l.metodo] ?? '99') ?? 0) + l.monto);
  if (!porMedio.size) porMedio.set((metodo && MEDIO[metodo]) || '99', total);

  // Nota parcial: solo las unidades acreditadas, con su parte del servicio y sin envío. Hacienda
  // exige el medio de pago: va el principal del cobro por el monto acreditado.
  if (parcial) {
    const servicioCobro = pago ? pago.montoServicio : cuenta.montoServicio;
    const elegidas = parcial.map((p) => ({ ...lineas[p.indice - 1]!, cantidad: p.cantidad }));
    const calc = (ls: typeof lineas) => ls.map((l) => calcularLinea(l, r.preciosIncluyenImpuestos));
    const base = (ls: typeof lineas) => calc(ls).reduce((n, c) => n + c.montoTotal, 0);
    const servicio = Math.round((servicioCobro * base(elegidas)) / base(lineas));
    const acreditado =
      Math.round(calc(elegidas).reduce((n, c) => n + c.totalLinea, 0) / 1000) + servicio;
    const [principal] = [...porMedio].sort((a, b) => b[1] - a[1])[0]!;
    return {
      total: null,
      xml: {
        lineas: elegidas,
        preciosIncluyenIva: r.preciosIncluyenImpuestos,
        servicio,
        envio: 0,
        medios: [{ tipo: principal, monto: acreditado }],
        moneda: r.moneda,
      },
    };
  }

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

export type LineaNota = { indice: number; cantidad: number };
// Lo que guarda una nota parcial en `lineasNota`.
export type DatosNota = { codigo: '06' | '14'; lineas: LineaNota[] };

// Líneas del cobro en el orden del comprobante (NumeroLinea = posición + 1).
export async function lineasDelCobro(
  o: { cuentaId: string; pagoId?: string },
  tipoCuenta: string,
  r: { cabysGeneral: string | null; porcentajeIva: number },
) {
  // Los pedidos en línea cuentan desde que se piden (igual que recalcularCuenta).
  const estados: ('CONFIRMADO' | 'PENDIENTE')[] =
    tipoCuenta === 'MESA' ? ['CONFIRMADO'] : ['CONFIRMADO', 'PENDIENTE'];
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
  return items.map((i) => {
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
  const guardar = (data: Prisma.ComprobanteUncheckedUpdateInput) =>
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
    if (e.estado === 'aceptado' || e.estado === 'rechazado') {
      const final = await guardar({
        estado: e.estado === 'aceptado' ? 'ACEPTADO' : 'RECHAZADO',
        mensaje: e.mensaje?.slice(0, 2000) ?? null,
        respuestaXml: e.respuestaXml ?? null,
      });
      // Aceptado y con correo del cliente: se le envía su comprobante (PDF + XML).
      if (final.estado === 'ACEPTADO' && final.receptorCorreo && !final.correoEnviadoEn)
        await enviarComprobantePorCorreo(final, final.receptorCorreo);
      return final;
    }
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
