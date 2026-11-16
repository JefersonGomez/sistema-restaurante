import { randomInt } from 'node:crypto';

// Clave y consecutivo de los comprobantes electrónicos (Anexos y Estructuras v4.4).

export const TIPO_DOC = {
  FACTURA: '01',
  NOTA_DEBITO: '02',
  NOTA_CREDITO: '03',
  TIQUETE: '04',
} as const;
export type TipoDoc = (typeof TIPO_DOC)[keyof typeof TIPO_DOC];

// Situación del comprobante: 1 normal, 2 contingencia, 3 sin internet.
export type Situacion = '1' | '2' | '3';

// Fecha y hora de Costa Rica (UTC−6, sin horario de verano).
export function fechaCR(fecha = new Date()) {
  const cr = new Date(fecha.getTime() - 6 * 3_600_000).toISOString();
  return {
    iso: `${cr.slice(0, 19)}-06:00`, // FechaEmision
    ddmmyy: `${cr.slice(8, 10)}${cr.slice(5, 7)}${cr.slice(2, 4)}`, // para la clave
  };
}

// 20 dígitos: sucursal (3) + terminal (5) + tipo de documento (2) + número (10).
export function consecutivo(tipo: TipoDoc, numero: number, sucursal = 1, terminal = 1) {
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > 9_999_999_999)
    throw new Error('Número de consecutivo fuera de rango');
  return (
    String(sucursal).padStart(3, '0') +
    String(terminal).padStart(5, '0') +
    tipo +
    String(numero).padStart(10, '0')
  );
}

// 50 dígitos: país (506) + DDMMAA + identificación del emisor (12) + consecutivo (20) +
// situación (1) + código de seguridad (8).
export function clave(opciones: {
  fecha: Date;
  identificacion: string;
  consecutivo: string;
  situacion?: Situacion;
  seguridad?: string;
}) {
  const id = opciones.identificacion.replace(/\D/g, '');
  if (!id || id.length > 12) throw new Error('Identificación del emisor no válida');
  if (!/^\d{20}$/.test(opciones.consecutivo)) throw new Error('Consecutivo no válido');
  const seguridad = opciones.seguridad ?? String(randomInt(0, 100_000_000)).padStart(8, '0');
  return (
    '506' +
    fechaCR(opciones.fecha).ddmmyy +
    id.padStart(12, '0') +
    opciones.consecutivo +
    (opciones.situacion ?? '1') +
    seguridad
  );
}
