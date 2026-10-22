import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import type { ActualizarMesaInput, MesaInput } from '@menu-qr/shared';
import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import { generarTokenQr } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';

export async function obtener(restauranteId: string, id: string) {
  const m = await prisma.mesa.findFirst({ where: { id, restauranteId } });
  if (!m) throw noExiste('Mesa');
  return m;
}

export const listar = (restauranteId: string) =>
  prisma.mesa.findMany({ where: { restauranteId }, orderBy: { numero: 'asc' } });

export const crear = (restauranteId: string, data: MesaInput) =>
  prisma.mesa.create({ data: { ...data, restauranteId, tokenQr: generarTokenQr() } });

export async function actualizar(restauranteId: string, id: string, data: ActualizarMesaInput) {
  await obtener(restauranteId, id);
  return prisma.mesa.update({ where: { id }, data });
}

export async function eliminar(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  await prisma.mesa.delete({ where: { id } });
}

// El QR viejo deja de funcionar.
export async function regenerarToken(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  return prisma.mesa.update({ where: { id }, data: { tokenQr: generarTokenQr() } });
}

export async function qr(restauranteId: string, id: string, formato: 'png' | 'svg') {
  const { tokenQr } = await obtener(restauranteId, id);
  const url = `${env.MENU_PUBLIC_URL}/m/${tokenQr}`;
  return formato === 'svg'
    ? { tipo: 'image/svg+xml', cuerpo: await QRCode.toString(url, { type: 'svg', margin: 2 }) }
    : {
        tipo: 'image/png',
        cuerpo: await QRCode.toBuffer(url, { type: 'png', margin: 2, width: 512 }),
      };
}

// Crea las mesas de un rango ("de la 1 a la 12"); las que ya existen se saltan.
export async function crearLote(
  restauranteId: string,
  { desde, hasta }: { desde: number; hasta: number },
) {
  const numeros = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const { count } = await prisma.mesa.createMany({
    data: numeros.map((numero) => ({ restauranteId, numero, tokenQr: generarTokenQr() })),
    skipDuplicates: true,
  });
  return { creadas: count, yaExistian: numeros.length - count };
}

// Logo del restaurante en PNG (pdfkit no lee WebP). Si no se puede bajar, va sin logo.
async function logoPng(url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(160, 160, { fit: 'inside' })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

const TEXTO_QR = 'Escanee para ver el menú y pedir · Scan to see the menu and order';

// PDF tamaño carta con los QR. "tarjetas": 2×3 por hoja con líneas de corte; "acrilico": una por hoja.
export async function pdfQr(
  restauranteId: string,
  ids: string[] | undefined,
  formato: 'tarjetas' | 'acrilico',
) {
  const mesas = await prisma.mesa.findMany({
    where: { restauranteId, ...(ids ? { id: { in: ids } } : { activa: true }) },
    orderBy: { numero: 'asc' },
  });
  // Solo mesas propias: si pidió alguna que no es de este restaurante, no se arma el PDF.
  if (ids && mesas.length !== new Set(ids).size) throw noExiste('Mesa');
  if (mesas.length === 0)
    throw new HttpError(400, 'SIN_MESAS', 'No hay mesas activas para imprimir');

  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  const logo = await logoPng(r.logoUrl);
  const qrs = await Promise.all(
    mesas.map((m) =>
      QRCode.toBuffer(`${env.MENU_PUBLIC_URL}/m/${m.tokenQr}`, {
        type: 'png',
        width: 600,
        margin: 1,
        errorCorrectionLevel: 'M',
      }),
    ),
  );

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0,
    info: { Title: `QR de mesas · ${r.nombre}` },
  });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const terminado = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(partes))));

  // Una tarjeta en (x, y) de ancho w y alto h; `k` escala los tamaños (1 = tarjeta chica).
  const tarjeta = (i: number, x: number, y: number, w: number, h: number, k: number) => {
    doc
      .save()
      .lineWidth(0.5)
      .dash(4, { space: 4 })
      .strokeColor('#9c98ad')
      .rect(x, y, w, h)
      .stroke()
      .restore();
    let cy = y + 14 * k;
    if (logo) {
      doc.image(logo, x + w / 2 - 14 * k, cy, { fit: [28 * k, 28 * k], align: 'center' });
      cy += 32 * k;
    }
    doc
      .fillColor('#1d1b2a')
      .font('Helvetica-Bold')
      .fontSize(13 * k)
      .text(r.nombre, x + 10, cy, { width: w - 20, align: 'center' });
    cy += 20 * k;
    const lado = Math.min(w - 40, h - (cy - y) - 70 * k);
    doc.image(qrs[i]!, x + (w - lado) / 2, cy, { width: lado });
    cy += lado + 6 * k;
    doc
      .font('Helvetica-Bold')
      .fontSize(20 * k)
      .fillColor('#5b2db5')
      .text(`Mesa ${mesas[i]!.numero}`, x, cy, { width: w, align: 'center' });
    cy += 26 * k;
    doc
      .font('Helvetica')
      .fontSize(8.5 * k)
      .fillColor('#6f6c80')
      .text(TEXTO_QR, x + 14, cy, { width: w - 28, align: 'center' });
  };

  if (formato === 'acrilico') {
    mesas.forEach((_, i) => {
      if (i > 0) doc.addPage();
      tarjeta(i, 66, 66, 480, 660, 2);
    });
  } else {
    const margen = 36;
    const w = (612 - margen * 2) / 2;
    const h = (792 - margen * 2) / 3;
    mesas.forEach((_, i) => {
      if (i > 0 && i % 6 === 0) doc.addPage();
      const pos = i % 6;
      tarjeta(i, margen + (pos % 2) * w, margen + Math.floor(pos / 2) * h, w, h, 1);
    });
  }
  doc.end();
  return terminado;
}
