import { DOMParser, type Element } from '@xmldom/xmldom';
import PDFDocument from 'pdfkit';

// Representación gráfica (PDF) de un comprobante, armada desde su XML firmado: lo que se ve es
// exactamente lo que se envió a Hacienda.

const TITULO: Record<string, string> = {
  FacturaElectronica: 'FACTURA ELECTRÓNICA',
  TiqueteElectronico: 'TIQUETE ELECTRÓNICO',
  NotaCreditoElectronica: 'NOTA DE CRÉDITO ELECTRÓNICA',
};
const TIPO_ID: Record<string, string> = {
  '01': 'Cédula física',
  '02': 'Cédula jurídica',
  '03': 'DIMEX',
  '04': 'NITE',
};
const TARIFA: Record<string, string> = {
  '08': '13 %',
  '04': '4 %',
  '03': '2 %',
  '02': '1 %',
  '10': 'exento',
};
const MEDIO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '03': 'Cheque',
  '04': 'Transferencia',
  '05': 'Recaudado por terceros',
  '06': 'SINPE Móvil',
  '07': 'Plataforma digital',
  '99': 'Otros',
};

// Hijo directo por nombre (sin importar el espacio de nombres).
const hijos = (e: Element | null | undefined, nombre: string) =>
  e
    ? Array.from(e.childNodes).filter(
        (n): n is Element => n.nodeType === 1 && (n as Element).localName === nombre,
      )
    : [];
const hijo = (e: Element | null | undefined, nombre: string) => hijos(e, nombre)[0];
const texto = (e: Element | null | undefined, ...ruta: string[]) => {
  let actual = e;
  for (const n of ruta) actual = hijo(actual, n);
  return actual?.textContent?.trim() ?? '';
};

export function pdfComprobante(xmlFirmado: string, o: { ambiente: string; moneda?: string }) {
  const raiz = new DOMParser().parseFromString(xmlFirmado, 'text/xml').documentElement!;
  const moneda =
    texto(raiz, 'ResumenFactura', 'CodigoTipoMoneda', 'CodigoMoneda') || o.moneda || 'CRC';
  const fmt = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  });
  // Las fuentes estándar del PDF no traen "₡": se usa "¢", como se escribe a mano en Costa Rica.
  // Sin espacios especiales: las fuentes estándar del PDF no los dibujan.
  const dinero = (v: string) =>
    fmt
      .format(Number(v || 0))
      .replace('₡', '¢')
      .replace(/[\u00a0\u202f]/g, ' ');

  const tipoDoc = raiz.localName ?? '';
  const emisor = hijo(raiz, 'Emisor');
  const receptor = hijo(raiz, 'Receptor');
  const resumen = hijo(raiz, 'ResumenFactura');
  const fecha = new Date(texto(raiz, 'FechaEmision'));

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 48,
    info: { Title: TITULO[tipoDoc] ?? 'Comprobante' },
  });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const fin = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(partes))));
  const ancho = doc.page.width - 96;
  const gris = '#5f5c6b';
  const tinta = '#17181b';

  // Encabezado: emisor a la izquierda, documento a la derecha.
  const top = doc.y;
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(tinta)
    .text(texto(emisor, 'NombreComercial') || texto(emisor, 'Nombre'), 48, top, {
      width: ancho * 0.55,
    });
  doc.font('Helvetica').fontSize(9).fillColor(gris);
  if (texto(emisor, 'NombreComercial')) doc.text(texto(emisor, 'Nombre'), { width: ancho * 0.55 });
  doc.text(
    `${TIPO_ID[texto(emisor, 'Identificacion', 'Tipo')] ?? 'Identificación'}: ${texto(emisor, 'Identificacion', 'Numero')}`,
  );
  doc.text(texto(emisor, 'Ubicacion', 'OtrasSenas'), { width: ancho * 0.55 });
  doc.text(texto(emisor, 'CorreoElectronico'));
  const finIzq = doc.y;

  const x = 48 + ancho * 0.58;
  const w = ancho * 0.42;
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#ff6f4f')
    .text(TITULO[tipoDoc] ?? 'COMPROBANTE', x, top, { width: w, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(tinta)
    .text(`N.º ${texto(raiz, 'NumeroConsecutivo')}`, x, doc.y, { width: w, align: 'right' })
    .text(`Fecha: ${fecha.toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`, {
      width: w,
      align: 'right',
    });
  doc.y = Math.max(finIzq, doc.y) + 8;
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(gris)
    .text(`Clave: ${texto(raiz, 'Clave')}`, 48, doc.y, { width: ancho });

  // Cliente
  if (receptor) {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(tinta).text('Cliente', 48);
    doc.font('Helvetica').fontSize(9).fillColor(tinta).text(texto(receptor, 'Nombre'));
    const tipo = texto(receptor, 'Identificacion', 'Tipo');
    if (tipo)
      doc
        .fillColor(gris)
        .text(
          `${TIPO_ID[tipo] ?? 'Identificación'}: ${texto(receptor, 'Identificacion', 'Numero')}`,
        );
    if (texto(receptor, 'CorreoElectronico'))
      doc.fillColor(gris).text(texto(receptor, 'CorreoElectronico'));
  }
  // Nota de crédito: qué anula y por qué.
  for (const ref of hijos(raiz, 'InformacionReferencia')) {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(tinta).text('Referencia', 48);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(gris)
      .text(`Anula el comprobante con clave ${texto(ref, 'Numero')}`)
      .text(`Motivo: ${texto(ref, 'Razon')}`);
  }

  // Detalle
  doc.moveDown(1);
  const col = {
    cant: 48,
    det: 92,
    precio: 48 + ancho - 230,
    iva: 48 + ancho - 140,
    total: 48 + ancho - 90,
  };
  const filaY = () => doc.y;
  let y = filaY();
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(gris)
    .text('Cant.', col.cant, y)
    .text('Descripción', col.det, y)
    .text('Precio unit.', col.precio, y, { width: 85, align: 'right' })
    .text('IVA', col.iva, y, { width: 40, align: 'right' })
    .text('Total', col.total, y, { width: 90, align: 'right' });
  doc
    .moveTo(48, doc.y + 3)
    .lineTo(48 + ancho, doc.y + 3)
    .strokeColor('#dddae6')
    .stroke();
  doc.moveDown(0.5);
  for (const l of hijos(hijo(raiz, 'DetalleServicio'), 'LineaDetalle')) {
    y = filaY();
    if (y > doc.page.height - 180) {
      doc.addPage();
      y = doc.y;
    }
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(tinta)
      .text(String(Number(texto(l, 'Cantidad'))), col.cant, y)
      .text(texto(l, 'Detalle'), col.det, y, { width: col.precio - col.det - 8 });
    const finDetalle = doc.y;
    doc
      .text(dinero(texto(l, 'PrecioUnitario')), col.precio, y, { width: 85, align: 'right' })
      .text(`${Number(texto(l, 'Impuesto', 'Tarifa'))}%`, col.iva, y, { width: 40, align: 'right' })
      .text(dinero(texto(l, 'MontoTotalLinea')), col.total, y, { width: 90, align: 'right' });
    doc.y = Math.max(finDetalle, doc.y) + 3;
  }
  doc
    .moveTo(48, doc.y + 2)
    .lineTo(48 + ancho, doc.y + 2)
    .strokeColor('#dddae6')
    .stroke();
  doc.moveDown(0.6);

  // Totales
  const total = (etiqueta: string, valor: string, fuerte = false) => {
    const ty = doc.y;
    doc
      .font(fuerte ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(fuerte ? 11 : 9)
      .fillColor(tinta)
      .text(etiqueta, 48 + ancho - 260, ty, { width: 160, align: 'right' })
      .text(valor, 48 + ancho - 95, ty, { width: 95, align: 'right' });
  };
  total('Total venta (sin IVA)', dinero(texto(resumen, 'TotalVentaNeta')));
  for (const d of hijos(resumen, 'TotalDesgloseImpuesto'))
    total(
      `IVA ${TARIFA[texto(d, 'CodigoTarifaIVA')] ?? texto(d, 'CodigoTarifaIVA')}`,
      dinero(texto(d, 'TotalMontoImpuesto')),
    );
  for (const oc of hijos(raiz, 'OtrosCargos'))
    total(texto(oc, 'Detalle'), dinero(texto(oc, 'MontoCargo')));
  total('TOTAL', dinero(texto(resumen, 'TotalComprobante')), true);
  const medios = hijos(resumen, 'MedioPago')
    .map(
      (m) => `${MEDIO[texto(m, 'TipoMedioPago')] ?? 'Otro'} ${dinero(texto(m, 'TotalMedioPago'))}`,
    )
    .join(' · ');
  if (medios)
    doc
      .moveDown(0.4)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(gris)
      .text(`Pagado con: ${medios}`, 48, doc.y, { width: ancho, align: 'right' });

  // Pie
  doc
    .moveDown(2)
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(gris)
    .text(
      'Representación gráfica de un comprobante electrónico (versión 4.4) emitido conforme a la ' +
        'normativa de comprobantes electrónicos del Ministerio de Hacienda de Costa Rica.' +
        (o.ambiente === 'pruebas' ? ' AMBIENTE DE PRUEBAS: SIN VALIDEZ FISCAL.' : ''),
      48,
      doc.y,
      { width: ancho, align: 'center' },
    );
  doc.text('Generado con KitchaGo', { width: ancho, align: 'center' });
  doc.end();
  return fin;
}
