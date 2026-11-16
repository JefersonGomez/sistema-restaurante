import { enviarCorreo } from '../../lib/correo';
import { prisma } from '../../lib/prisma';
import type { Comprobante } from '../../generated/prisma/client';
import { pdfComprobante } from './pdf';

const NOMBRE: Record<Comprobante['tipo'], [string, string]> = {
  TE: ['Tiquete electrónico', 'tiquete'],
  FE: ['Factura electrónica', 'factura'],
  NC: ['Nota de crédito electrónica', 'nota-credito'],
};

// Archivos del comprobante: PDF, XML firmado y respuesta de Hacienda (si ya la hay).
export async function archivosComprobante(c: Comprobante) {
  if (!c.xmlFirmado) throw new Error('El comprobante no tiene XML firmado');
  const base = `${NOMBRE[c.tipo][1]}-${c.consecutivo}`;
  const archivos = [
    {
      nombre: `${base}.pdf`,
      contenido: await pdfComprobante(c.xmlFirmado, { ambiente: c.ambiente }),
    },
    { nombre: `${base}.xml`, contenido: Buffer.from(c.xmlFirmado, 'utf8') },
  ];
  if (c.respuestaXml)
    archivos.push({
      nombre: `${base}-respuesta-hacienda.xml`,
      contenido: Buffer.from(c.respuestaXml, 'utf8'),
    });
  return archivos;
}

// Envía al cliente su comprobante aceptado y anota el resultado. Nunca lanza.
export async function enviarComprobantePorCorreo(c: Comprobante, para: string) {
  try {
    const r = await prisma.restaurante.findUniqueOrThrow({
      where: { id: c.restauranteId },
      select: { nombre: true, moneda: true },
    });
    const [titulo] = NOMBRE[c.tipo];
    const total = new Intl.NumberFormat('es-CR', { style: 'currency', currency: r.moneda }).format(
      c.total / 100,
    );
    const numero = String(Number(c.consecutivo.slice(-10)));
    const resultado = await enviarCorreo({
      para,
      asunto: `${titulo} N.º ${numero} · ${r.nombre}`,
      texto:
        `Hola${c.receptorNombre ? ` ${c.receptorNombre}` : ''}:\n\n` +
        `Le enviamos su ${titulo.toLowerCase()} de ${r.nombre} por ${total}.\n` +
        `Clave numérica: ${c.clave}\n\n` +
        'Adjuntamos la representación en PDF, el XML del comprobante y la respuesta de aceptación ' +
        'del Ministerio de Hacienda.' +
        (c.ambiente === 'pruebas' ? '\n\n(Ambiente de pruebas: sin validez fiscal.)' : '') +
        `\n\n¡Gracias por su preferencia!\n${r.nombre}`,
      adjuntos: await archivosComprobante(c),
    });
    await prisma.comprobante.update({
      where: { id: c.id },
      data: {
        correoPara: para,
        correoEnviadoEn: resultado.enviado ? new Date() : null,
        correoError: resultado.enviado ? null : (resultado.error ?? 'No se pudo enviar'),
      },
    });
    return resultado;
  } catch (e) {
    const error = (e as Error).message.slice(0, 300);
    await prisma.comprobante
      .update({ where: { id: c.id }, data: { correoPara: para, correoError: error } })
      .catch(() => {});
    return { enviado: false, error };
  }
}
