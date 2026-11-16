// XML v4.4 de tiquete, factura y nota de crédito (sin firma). El orden de los nodos sigue los XSD
// oficiales de Hacienda. Montos en "unidades" de 0,00001 colones (céntimos × 1000), enteros.

export type TipoComprobante = 'TE' | 'FE' | 'NC';

const RAIZ: Record<TipoComprobante, { nodo: string; ns: string }> = {
  TE: { nodo: 'TiqueteElectronico', ns: 'tiqueteElectronico' },
  FE: { nodo: 'FacturaElectronica', ns: 'facturaElectronica' },
  NC: { nodo: 'NotaCreditoElectronica', ns: 'notaCreditoElectronica' },
};

// % de IVA → CodigoTarifaIVA de Hacienda.
const CODIGO_TARIFA: Record<number, string> = { 13: '08', 4: '04', 2: '03', 1: '02', 0: '10' };

export type Identificacion = { tipo: '01' | '02' | '03' | '04'; numero: string };
export type Ubicacion = { provincia: number; canton: number; distrito: number; otrasSenas: string };

export type LineaComprobante = {
  cabys: string;
  detalle: string;
  cantidad: number;
  precioUnitario: number; // céntimos, como se cobró (con o sin IVA según el restaurante)
  tarifaIva: number; // 13, 4, 2, 1 o 0
};

export type DatosComprobante = {
  tipo: TipoComprobante;
  clave: string;
  consecutivo: string;
  fechaEmision: string; // ISO con -06:00
  proveedorSistemas: string;
  actividadEmisor: string; // CIIU 4, 6 caracteres
  emisor: {
    nombre: string;
    identificacion: Identificacion;
    nombreComercial?: string;
    ubicacion: Ubicacion;
    correo: string;
  };
  receptor?: { nombre: string; identificacion?: Identificacion; correo?: string };
  lineas: LineaComprobante[];
  preciosIncluyenIva: boolean;
  servicio: number; // céntimos del 10 % (0 si no aplica)
  medios: { tipo: '01' | '02' | '04' | '06' | '99'; monto: number }[]; // céntimos
  moneda: 'CRC' | 'USD';
  tipoCambio?: number;
  referencia?: { tipoDoc: string; numero: string; fecha: string; codigo: string; razon: string };
};

const U = 1000; // unidades por céntimo
const dec5 = (u: number) => {
  const signo = u < 0 ? '-' : '';
  const a = Math.abs(Math.round(u));
  return `${signo}${Math.floor(a / 100_000)}.${String(a % 100_000).padStart(5, '0')}`;
};
const dec3 = (n: number) => n.toFixed(3);
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nodo = (nombre: string, valor: string | number) =>
  `<${nombre}>${esc(String(valor))}</${nombre}>`;

// CABYS: secciones 0–4 son bienes y 5–9 servicios.
const esServicio = (cabys: string) => Number(cabys[0]) >= 5;

export function calcularLinea(l: LineaComprobante, preciosIncluyenIva: boolean) {
  const bruto = l.precioUnitario * U;
  const precioUnitario = preciosIncluyenIva
    ? Math.round((bruto * 100) / (100 + l.tarifaIva))
    : bruto;
  const montoTotal = precioUnitario * l.cantidad;
  const impuesto = Math.round((montoTotal * l.tarifaIva) / 100);
  return { precioUnitario, montoTotal, impuesto, totalLinea: montoTotal + impuesto };
}

export function construirXml(d: DatosComprobante) {
  const { nodo: raiz, ns } = RAIZ[d.tipo];
  const ident = (i: Identificacion) =>
    `<Identificacion>${nodo('Tipo', i.tipo)}${nodo('Numero', i.numero)}</Identificacion>`;
  const ubic = (u: Ubicacion) =>
    `<Ubicacion>${nodo('Provincia', u.provincia)}${nodo('Canton', String(u.canton).padStart(2, '0'))}` +
    `${nodo('Distrito', String(u.distrito).padStart(2, '0'))}${nodo('OtrasSenas', u.otrasSenas)}</Ubicacion>`;

  const t = {
    servGravados: 0,
    servExentos: 0,
    mercGravadas: 0,
    mercExentas: 0,
    impuesto: 0,
    desglose: new Map<string, number>(),
  };
  const lineas = d.lineas.map((l, i) => {
    const c = calcularLinea(l, d.preciosIncluyenIva);
    const servicio = esServicio(l.cabys);
    const gravada = l.tarifaIva > 0;
    if (servicio) t[gravada ? 'servGravados' : 'servExentos'] += c.montoTotal;
    else t[gravada ? 'mercGravadas' : 'mercExentas'] += c.montoTotal;
    const codigoTarifa = CODIGO_TARIFA[l.tarifaIva];
    if (!codigoTarifa) throw new Error(`Tarifa de IVA no soportada: ${l.tarifaIva}`);
    t.impuesto += c.impuesto;
    t.desglose.set(codigoTarifa, (t.desglose.get(codigoTarifa) ?? 0) + c.impuesto);
    return (
      '<LineaDetalle>' +
      nodo('NumeroLinea', i + 1) +
      nodo('CodigoCABYS', l.cabys) +
      nodo('Cantidad', dec3(l.cantidad)) +
      nodo('UnidadMedida', servicio ? 'Sp' : 'Unid') +
      nodo('Detalle', l.detalle.slice(0, 200).padEnd(3, '.')) +
      nodo('PrecioUnitario', dec5(c.precioUnitario)) +
      nodo('MontoTotal', dec5(c.montoTotal)) +
      nodo('SubTotal', dec5(c.montoTotal)) +
      nodo('BaseImponible', dec5(c.montoTotal)) +
      '<Impuesto>' +
      nodo('Codigo', '01') +
      nodo('CodigoTarifaIVA', codigoTarifa) +
      nodo('Tarifa', l.tarifaIva.toFixed(2)) +
      nodo('Monto', dec5(c.impuesto)) +
      '</Impuesto>' +
      nodo('ImpuestoAsumidoEmisorFabrica', dec5(0)) +
      nodo('ImpuestoNeto', dec5(c.impuesto)) +
      nodo('MontoTotalLinea', dec5(c.totalLinea)) +
      '</LineaDetalle>'
    );
  });

  const servicio = d.servicio * U;
  const totalGravado = t.servGravados + t.mercGravadas;
  const totalExento = t.servExentos + t.mercExentas;
  const totalVenta = totalGravado + totalExento;
  const totalComprobante = totalVenta + t.impuesto + servicio;
  const opcional = (n: string, u: number) => (u ? nodo(n, dec5(u)) : '');

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<${raiz} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/${ns}" ` +
    `xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    nodo('Clave', d.clave) +
    nodo('ProveedorSistemas', d.proveedorSistemas) +
    nodo('CodigoActividadEmisor', d.actividadEmisor) +
    nodo('NumeroConsecutivo', d.consecutivo) +
    nodo('FechaEmision', d.fechaEmision) +
    '<Emisor>' +
    nodo('Nombre', d.emisor.nombre) +
    ident(d.emisor.identificacion) +
    (d.emisor.nombreComercial ? nodo('NombreComercial', d.emisor.nombreComercial) : '') +
    ubic(d.emisor.ubicacion) +
    nodo('CorreoElectronico', d.emisor.correo) +
    '</Emisor>' +
    (d.receptor
      ? '<Receptor>' +
        nodo('Nombre', d.receptor.nombre) +
        (d.receptor.identificacion ? ident(d.receptor.identificacion) : '') +
        (d.receptor.correo ? nodo('CorreoElectronico', d.receptor.correo) : '') +
        '</Receptor>'
      : '') +
    nodo('CondicionVenta', '01') +
    `<DetalleServicio>${lineas.join('')}</DetalleServicio>` +
    (servicio
      ? '<OtrosCargos>' +
        nodo('TipoDocumentoOC', '06') +
        nodo('Detalle', 'Impuesto de servicio 10%') +
        nodo('PorcentajeOC', '10.00000') +
        nodo('MontoCargo', dec5(servicio)) +
        '</OtrosCargos>'
      : '') +
    '<ResumenFactura>' +
    `<CodigoTipoMoneda>${nodo('CodigoMoneda', d.moneda)}${nodo('TipoCambio', (d.tipoCambio ?? 1).toFixed(5))}</CodigoTipoMoneda>` +
    opcional('TotalServGravados', t.servGravados) +
    opcional('TotalServExentos', t.servExentos) +
    opcional('TotalMercanciasGravadas', t.mercGravadas) +
    opcional('TotalMercanciasExentas', t.mercExentas) +
    opcional('TotalGravado', totalGravado) +
    opcional('TotalExento', totalExento) +
    nodo('TotalVenta', dec5(totalVenta)) +
    nodo('TotalVentaNeta', dec5(totalVenta)) +
    [...t.desglose]
      .map(
        ([codigo, monto]) =>
          `<TotalDesgloseImpuesto>${nodo('Codigo', '01')}${nodo('CodigoTarifaIVA', codigo)}${nodo('TotalMontoImpuesto', dec5(monto))}</TotalDesgloseImpuesto>`,
      )
      .join('') +
    nodo('TotalImpuesto', dec5(t.impuesto)) +
    opcional('TotalOtrosCargos', servicio) +
    d.medios
      .slice(0, 4)
      .map(
        (m) =>
          `<MedioPago>${nodo('TipoMedioPago', m.tipo)}${nodo('TotalMedioPago', dec5(m.monto * U))}</MedioPago>`,
      )
      .join('') +
    nodo('TotalComprobante', dec5(totalComprobante)) +
    '</ResumenFactura>' +
    (d.referencia
      ? '<InformacionReferencia>' +
        nodo('TipoDocIR', d.referencia.tipoDoc) +
        nodo('Numero', d.referencia.numero) +
        nodo('FechaEmisionIR', d.referencia.fecha) +
        nodo('Codigo', d.referencia.codigo) +
        nodo('Razon', d.referencia.razon) +
        '</InformacionReferencia>'
      : '') +
    `</${raiz}>`;
  return { xml, totalComprobante };
}
