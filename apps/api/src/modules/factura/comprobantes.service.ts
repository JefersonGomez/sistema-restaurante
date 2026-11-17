import type {
  AnularComprobanteInput,
  ComprobantesCaja,
  ConfigHaciendaInput,
  ConfigHaciendaVista,
  Contribuyente,
  LineaAcreditable,
  NotaParcialInput,
} from '@menu-qr/shared';
import type { Comprobante } from '../../generated/prisma/client';
import { cifrar, descifrar } from '../../lib/cifrado';
import { prisma } from '../../lib/prisma';
import { HttpError, noExiste } from '../../middlewares/errorHandler';
import { datosLugar, lugarDe } from '../pedidos/detalle';
import { archivosComprobante, enviarComprobantePorCorreo } from './correo-comprobante';
import {
  emitirComprobante,
  lineasDelCobro,
  procesarCola,
  type DatosNota,
  type Receptor,
} from './factura.service';
import { abrirLlave } from './firma';
import { ErrorHacienda, token, type Ambiente } from './hacienda';

// Comprobantes recientes para la caja (los últimos 30).
export async function listar(restauranteId: string): Promise<ComprobantesCaja> {
  const [cfg, lista] = await Promise.all([
    prisma.configHacienda.findUnique({ where: { restauranteId }, select: { activa: true } }),
    prisma.comprobante.findMany({
      where: { restauranteId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { cuenta: { select: datosLugar } },
    }),
  ]);
  // Notas de crédito vigentes (que no fallaron): sin líneas = anulado; con líneas = parcial.
  const notas = await prisma.comprobante.findMany({
    where: {
      restauranteId,
      tipo: 'NC',
      referenciaId: { in: lista.map((c) => c.id) },
      estado: { notIn: ['ERROR', 'RECHAZADO'] },
    },
    select: { referenciaId: true, lineasNota: true },
  });
  const anulados = new Set(notas.filter((n) => !n.lineasNota).map((n) => n.referenciaId));
  const parciales = (id: string) =>
    notas.filter((n) => n.lineasNota && n.referenciaId === id).length;
  return {
    activa: !!cfg?.activa,
    comprobantes: lista.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      consecutivo: c.consecutivo,
      clave: c.clave,
      estado: c.estado,
      mensaje: c.mensaje,
      total: c.total,
      receptorNombre: c.receptorNombre,
      lugar: lugarDe(c.cuenta),
      referenciaId: c.referenciaId,
      anulado: anulados.has(c.id),
      notasParciales: parciales(c.id),
      receptorCorreo: c.receptorCorreo,
      correoPara: c.correoPara,
      correoEnviadoEn: c.correoEnviadoEn?.toISOString() ?? null,
      correoError: c.correoError,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

// Los que quedaron en error o rechazados se emiten de nuevo con otro número; los que esperan se
// mandan ya.
export async function reintentar(restauranteId: string, id: string) {
  const c = await prisma.comprobante.findFirst({ where: { id, restauranteId } });
  if (!c) throw noExiste('Comprobante');
  if (c.estado === 'ACEPTADO')
    throw new HttpError(409, 'YA_ACEPTADO', 'Este comprobante ya fue aceptado por Hacienda');
  if (c.estado === 'PENDIENTE' || c.estado === 'ENVIADO') {
    await prisma.comprobante.update({
      where: { id },
      data: { proximoIntento: new Date(), intentos: 0 },
    });
    await procesarCola();
  } else {
    const receptor: Receptor | undefined = c.receptorNombre
      ? {
          nombre: c.receptorNombre,
          tipoId: (c.receptorTipoId ?? undefined) as Receptor['tipoId'],
          numero: c.receptorNumero ?? undefined,
          correo: c.receptorCorreo ?? undefined,
        }
      : undefined;
    // Una nota de crédito fallida se vuelve a emitir como nota sobre el mismo original.
    const original =
      c.tipo === 'NC' && c.referenciaId
        ? await prisma.comprobante.findUnique({ where: { id: c.referenciaId } })
        : null;
    const nota = c.lineasNota as DatosNota | null;
    const nuevo = await emitirComprobante({
      restauranteId,
      cuentaId: c.cuentaId,
      pagoId: c.pagoId ?? undefined,
      receptor,
      anula: original
        ? {
            comprobante: original,
            razon: c.razon ?? 'Anulación',
            codigo: nota?.codigo,
            lineas: nota?.lineas,
          }
        : undefined,
    });
    if (!nuevo) throw new HttpError(409, 'FE_INACTIVA', 'La factura electrónica no está activa');
    await prisma.comprobante.update({
      where: { id },
      data: { mensaje: `${c.mensaje ?? ''} · Reemitido como ${nuevo.consecutivo}`.slice(0, 500) },
    });
  }
  return listar(restauranteId);
}

// Anula un tiquete o factura aceptado con una nota de crédito por el total. Con "reemitir" emite
// después otro comprobante del mismo cobro (p. ej. con los datos correctos del cliente).
export async function anular(restauranteId: string, id: string, input: AnularComprobanteInput) {
  const c = await prisma.comprobante.findFirst({ where: { id, restauranteId } });
  if (!c) throw noExiste('Comprobante');
  if (c.tipo === 'NC') throw new HttpError(409, 'ES_NOTA', 'Una nota de crédito no se anula');
  if (c.estado !== 'ACEPTADO')
    throw new HttpError(
      409,
      'NO_ACEPTADO',
      'Solo se anula un comprobante aceptado por Hacienda; si tiene error, vuelva a emitirlo',
    );
  const { total, porLinea } = await acreditado(c);
  if (total)
    throw new HttpError(409, 'YA_ANULADO', 'Este comprobante ya tiene una nota de crédito');
  if (porLinea.size)
    throw new HttpError(
      409,
      'TIENE_PARCIALES',
      'Ya tiene devoluciones parciales: use «Devolución parcial» para lo que queda',
    );

  const nota = await emitirComprobante({
    restauranteId,
    cuentaId: c.cuentaId,
    pagoId: c.pagoId ?? undefined,
    anula: { comprobante: c, razon: input.razon },
  });
  if (!nota) throw new HttpError(409, 'FE_INACTIVA', 'La factura electrónica no está activa');
  if (nota.estado !== 'ERROR' && input.reemitir)
    await emitirComprobante({
      restauranteId,
      cuentaId: c.cuentaId,
      pagoId: c.pagoId ?? undefined,
      receptor: input.receptor,
    });
  return listar(restauranteId);
}

// Lo ya acreditado en notas vigentes: si alguna anula todo, y las unidades por línea de las parciales.
async function acreditado(c: Comprobante) {
  const notas = await prisma.comprobante.findMany({
    where: { referenciaId: c.id, tipo: 'NC', estado: { notIn: ['ERROR', 'RECHAZADO'] } },
    select: { lineasNota: true },
  });
  const porLinea = new Map<number, number>();
  for (const n of notas)
    for (const l of (n.lineasNota as DatosNota | null)?.lineas ?? [])
      porLinea.set(l.indice, (porLinea.get(l.indice) ?? 0) + l.cantidad);
  return { total: notas.some((n) => !n.lineasNota), porLinea };
}

async function acreditable(restauranteId: string, id: string) {
  const c = await prisma.comprobante.findFirst({ where: { id, restauranteId } });
  if (!c) throw noExiste('Comprobante');
  if (c.tipo === 'NC') throw new HttpError(409, 'ES_NOTA', 'Una nota de crédito no se acredita');
  if (c.estado !== 'ACEPTADO')
    throw new HttpError(
      409,
      'NO_ACEPTADO',
      'Solo se acredita un comprobante aceptado por Hacienda',
    );
  const cuenta = await prisma.cuenta.findUniqueOrThrow({
    where: { id: c.cuentaId },
    select: { tipo: true, restaurante: { select: { cabysGeneral: true, porcentajeIva: true } } },
  });
  const lineas = await lineasDelCobro(
    { cuentaId: c.cuentaId, pagoId: c.pagoId ?? undefined },
    cuenta.tipo,
    cuenta.restaurante,
  );
  const { total, porLinea } = await acreditado(c);
  const disponibles: LineaAcreditable[] = lineas.map((l, i) => ({
    indice: i + 1,
    detalle: l.detalle,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    disponible: total ? 0 : l.cantidad - (porLinea.get(i + 1) ?? 0),
  }));
  return { c, disponibles };
}

// Platos del comprobante y cuántas unidades se pueden acreditar todavía.
export async function lineasAcreditables(restauranteId: string, id: string) {
  return (await acreditable(restauranteId, id)).disponibles;
}

// Nota de crédito parcial: acredita solo las unidades elegidas (06 devolución, 14 error de monto).
export async function notaParcial(restauranteId: string, id: string, input: NotaParcialInput) {
  const { c, disponibles } = await acreditable(restauranteId, id);
  for (const l of input.lineas) {
    const d = disponibles[l.indice - 1];
    if (!d) throw new HttpError(400, 'LINEA_INVALIDA', 'Ese plato no está en el comprobante');
    if (l.cantidad > d.disponible)
      throw new HttpError(
        409,
        'EXCEDE',
        d.disponible
          ? `De «${d.detalle}» solo quedan ${d.disponible} por acreditar`
          : `«${d.detalle}» ya se acreditó por completo`,
      );
  }
  const nota = await emitirComprobante({
    restauranteId,
    cuentaId: c.cuentaId,
    pagoId: c.pagoId ?? undefined,
    anula: {
      comprobante: c,
      razon: input.razon,
      codigo: input.tipo === 'devolucion' ? '06' : '14',
      lineas: input.lineas,
    },
  });
  if (!nota) throw new HttpError(409, 'FE_INACTIVA', 'La factura electrónica no está activa');
  return listar(restauranteId);
}

// Envía (o reenvía) un comprobante aceptado al correo del cliente o a otro.
export async function enviarPorCorreo(restauranteId: string, id: string, correo?: string) {
  const c = await prisma.comprobante.findFirst({ where: { id, restauranteId } });
  if (!c) throw noExiste('Comprobante');
  if (c.estado !== 'ACEPTADO')
    throw new HttpError(409, 'NO_ACEPTADO', 'Se envía cuando Hacienda lo haya aceptado');
  const para = correo ?? c.receptorCorreo;
  if (!para) throw new HttpError(400, 'SIN_CORREO', 'Escriba el correo del cliente');
  const r = await enviarComprobantePorCorreo(c, para);
  if (!r.enviado) throw new HttpError(502, 'CORREO_NO_ENVIADO', r.error ?? 'No se pudo enviar');
  return listar(restauranteId);
}

// PDF o XML firmado para descargar.
export async function archivo(restauranteId: string, id: string, tipo: 'pdf' | 'xml') {
  const c = await prisma.comprobante.findFirst({ where: { id, restauranteId } });
  if (!c?.xmlFirmado) throw noExiste('Comprobante');
  const [pdf, xml] = await archivosComprobante(c);
  return tipo === 'pdf' ? pdf! : xml!;
}

// Registro público de contribuyentes de Hacienda (nombre y actividades por cédula).
export async function contribuyente(id: string): Promise<Contribuyente> {
  let r: Response;
  try {
    r = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${id}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(502, 'HACIENDA_NO_DISPONIBLE', 'No se pudo consultar a Hacienda');
  }
  if (r.status === 404) throw noExiste('Contribuyente');
  if (!r.ok) throw new HttpError(502, 'HACIENDA_NO_DISPONIBLE', 'No se pudo consultar a Hacienda');
  const d = (await r.json()) as {
    nombre: string;
    tipoIdentificacion: string;
    actividades?: { estado: string; codigo: string; descripcion: string }[];
  };
  return {
    nombre: d.nombre,
    tipoId: d.tipoIdentificacion,
    actividades: (d.actividades ?? [])
      .filter((a) => a.estado === 'A')
      .map((a) => ({ codigo: a.codigo, descripcion: a.descripcion.replace(/\s+/g, ' ').trim() })),
  };
}

// --- Configuración de Hacienda del restaurante (dueño) ---

export async function obtenerConfig(restauranteId: string): Promise<ConfigHaciendaVista | null> {
  const c = await prisma.configHacienda.findUnique({ where: { restauranteId } });
  if (!c) return null;
  return {
    activa: c.activa,
    ambiente: c.ambiente as Ambiente,
    tipoId: c.tipoId as ConfigHaciendaVista['tipoId'],
    numeroId: c.numeroId,
    nombre: c.nombre,
    nombreComercial: c.nombreComercial,
    correo: c.correo,
    provincia: c.provincia,
    canton: c.canton,
    distrito: c.distrito,
    otrasSenas: c.otrasSenas,
    actividad: c.actividad,
    tieneCredenciales: !!c.usuarioCifrado && !!c.claveCifrada,
    tieneLlave: !!c.llaveCifrada,
    llaveVence: c.llaveVence?.toISOString() ?? null,
  };
}

export async function guardarConfig(restauranteId: string, input: ConfigHaciendaInput) {
  const previa = await prisma.configHacienda.findUnique({ where: { restauranteId } });
  const { usuario, clave, llaveP12, pin, ...datos } = input;

  // La llave se valida con su PIN antes de guardarla.
  let llave: { llaveCifrada: string; pinCifrado: string; llaveVence: Date } | null = null;
  if (llaveP12 || pin) {
    const archivo = llaveP12
      ? Buffer.from(llaveP12, 'base64')
      : previa?.llaveCifrada
        ? descifrar(previa.llaveCifrada)
        : null;
    const elPin =
      pin ?? (previa?.pinCifrado ? descifrar(previa.pinCifrado).toString('utf8') : null);
    if (!archivo || !elPin)
      throw new HttpError(
        400,
        'FALTA_LLAVE',
        'Suba la llave criptográfica (.p12) y escriba su PIN',
      );
    let abierta;
    try {
      abierta = await abrirLlave(archivo, elPin);
    } catch (e) {
      throw new HttpError(400, 'LLAVE_INVALIDA', (e as Error).message);
    }
    llave = { llaveCifrada: cifrar(archivo), pinCifrado: cifrar(elPin), llaveVence: abierta.vence };
  }
  const secretos = {
    ...(usuario && { usuarioCifrado: cifrar(usuario) }),
    ...(clave && { claveCifrada: cifrar(clave) }),
    ...llave,
  };
  const completa =
    (secretos.usuarioCifrado ?? previa?.usuarioCifrado) &&
    (secretos.claveCifrada ?? previa?.claveCifrada) &&
    (secretos.llaveCifrada ?? previa?.llaveCifrada);
  if (datos.activa && !completa)
    throw new HttpError(
      400,
      'CONFIG_INCOMPLETA',
      'Para activarla faltan el usuario y la clave de la API o la llave criptográfica',
    );

  if (previa)
    await prisma.configHacienda.update({
      where: { restauranteId },
      data: { ...datos, ...secretos },
    });
  else {
    if (!completa)
      throw new HttpError(
        400,
        'CONFIG_INCOMPLETA',
        'Escriba el usuario y la clave de la API y suba la llave criptográfica',
      );
    await prisma.configHacienda.create({
      data: {
        ...datos,
        restauranteId,
        usuarioCifrado: secretos.usuarioCifrado!,
        claveCifrada: secretos.claveCifrada!,
        llaveCifrada: secretos.llaveCifrada!,
        pinCifrado: secretos.pinCifrado!,
        llaveVence: secretos.llaveVence,
      },
    });
  }
  return obtenerConfig(restauranteId);
}

// Pide un token con el usuario y la clave guardados: confirma que Hacienda los acepta.
export async function probarConexion(restauranteId: string) {
  const c = await prisma.configHacienda.findUnique({ where: { restauranteId } });
  if (!c) throw noExiste('Configuración de Hacienda');
  try {
    await token({
      ambiente: c.ambiente as Ambiente,
      usuario: descifrar(c.usuarioCifrado).toString('utf8'),
      clave: descifrar(c.claveCifrada).toString('utf8'),
    });
    return { ok: true, mensaje: 'Hacienda aceptó el usuario y la clave' };
  } catch (e) {
    if (e instanceof ErrorHacienda) return { ok: false, mensaje: e.message };
    return { ok: false, mensaje: 'No se pudo conectar con Hacienda' };
  }
}
