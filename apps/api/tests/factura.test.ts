import { DOMParser } from '@xmldom/xmldom';
import forge from 'node-forge';
import * as xadesjs from 'xadesjs';
import { describe, expect, it } from 'vitest';
import { clave, consecutivo, fechaCR, TIPO_DOC } from '../src/modules/factura/clave';
import { abrirLlave, firmar } from '../src/modules/factura/firma';
import { calcularLinea, construirXml, type DatosComprobante } from '../src/modules/factura/xml';

// Llave .p12 de prueba (autofirmada) para no depender de la llave real ni de internet.
function p12DePrueba(pin: string) {
  const llaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const nombre = [{ shortName: 'CN', value: 'Emisor de prueba' }];
  cert.setSubject(nombre);
  cert.setIssuer(nombre);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], pin, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

const base: DatosComprobante = {
  tipo: 'TE',
  clave: '5'.repeat(50),
  consecutivo: '0'.repeat(20),
  fechaEmision: '2026-11-15T12:00:00-06:00',
  proveedorSistemas: '123456789',
  actividadEmisor: '5610.0',
  emisor: {
    nombre: 'Soda de Prueba',
    identificacion: { tipo: '01', numero: '123456789' },
    ubicacion: { provincia: 1, canton: 1, distrito: 1, otrasSenas: 'Frente al parque' },
    correo: 'soda@prueba.test',
  },
  lineas: [
    {
      cabys: '6331000000000',
      detalle: 'Casado con pollo',
      cantidad: 2,
      precioUnitario: 480000,
      tarifaIva: 13,
    },
    {
      cabys: '2391102010200',
      detalle: 'Café en grano',
      cantidad: 1,
      precioUnitario: 101000,
      tarifaIva: 1,
    },
  ],
  preciosIncluyenIva: true,
  servicio: 84956,
  medios: [{ tipo: '06', monto: 1145956 }],
  moneda: 'CRC',
};

describe('clave y consecutivo', () => {
  it('arma el consecutivo de 20 y la clave de 50 dígitos', () => {
    const c = consecutivo(TIPO_DOC.TIQUETE, 42);
    expect(c).toBe('00100001040000000042');
    const fecha = new Date('2026-11-15T03:00:00Z'); // 14 nov 21:00 en Costa Rica
    expect(fechaCR(fecha)).toEqual({ iso: '2026-11-14T21:00:00-06:00', ddmmyy: '141126' });
    const k = clave({
      fecha,
      identificacion: '1-2345-6789',
      consecutivo: c,
      seguridad: '12345678',
    });
    expect(k).toBe(`506141126000123456789${c}112345678`);
    expect(k).toHaveLength(50);
    expect(() => consecutivo(TIPO_DOC.TIQUETE, 0)).toThrow();
  });
});

describe('XML v4.4', () => {
  it('saca la base sin IVA de precios con IVA incluido y suma bien el resumen', () => {
    // ₡4 800 con 13 % incluido → base 4 247,78761 por unidad.
    expect(calcularLinea(base.lineas[0]!, true)).toEqual({
      precioUnitario: 424778761,
      montoTotal: 849557522,
      impuesto: 110442478,
      totalLinea: 960000000,
    });
    const { xml, totalComprobante } = construirXml(base);
    expect(xml).toContain('<CodigoActividadEmisor>5610.0</CodigoActividadEmisor>');
    // El casado es servicio (CABYS 6…) y el café un bien (CABYS 2…).
    expect(xml).toContain('<UnidadMedida>Sp</UnidadMedida>');
    expect(xml).toContain('<UnidadMedida>Unid</UnidadMedida>');
    expect(xml).toContain('<CodigoTarifaIVA>08</CodigoTarifaIVA>');
    expect(xml).toContain('<CodigoTarifaIVA>02</CodigoTarifaIVA>');
    // 10 % de servicio en otros cargos con el código 06.
    expect(xml).toContain(
      '<OtrosCargos><TipoDocumentoOC>06</TipoDocumentoOC><Detalle>Impuesto de servicio 10%</Detalle><PorcentajeOC>10.00000</PorcentajeOC><MontoCargo>849.56000</MontoCargo></OtrosCargos>',
    );
    expect(xml).toContain('<MedioPago><TipoMedioPago>06</TipoMedioPago>');
    // Total = ₡9 600 + ₡1 010 (con IVA) + ₡849,56 de servicio.
    expect(totalComprobante).toBe(1145956000);
    expect(xml).toContain('<TotalComprobante>11459.56000</TotalComprobante>');
    // Orden del esquema: Emisor antes de CondicionVenta y el resumen al final.
    expect(xml.indexOf('<Emisor>')).toBeLessThan(xml.indexOf('<CondicionVenta>'));
    expect(xml.indexOf('<DetalleServicio>')).toBeLessThan(xml.indexOf('<OtrosCargos>'));
    expect(new DOMParser().parseFromString(xml, 'text/xml').documentElement?.nodeName).toBe(
      'TiqueteElectronico',
    );
  });

  it('escapa los textos y no lleva otros cargos si no hay servicio', () => {
    const { xml } = construirXml({
      ...base,
      servicio: 0,
      lineas: [{ ...base.lineas[0]!, detalle: 'Pinto & huevo <frito>' }],
    });
    expect(xml).toContain('Pinto &amp; huevo &lt;frito&gt;');
    expect(xml).not.toContain('<OtrosCargos>');
  });
});

describe('firma XAdES-EPES', () => {
  it('firma con la llave .p12 y la firma se puede verificar', { timeout: 30_000 }, async () => {
    const llave = await abrirLlave(p12DePrueba('1234'), '1234');
    await expect(abrirLlave(p12DePrueba('1234'), '9999')).rejects.toThrow(/PIN/);
    const firmado = await firmar(construirXml(base).xml, llave);
    expect(firmado).toContain('<xades:SigPolicyHash>');
    expect(firmado).toContain('DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=');
    expect(firmado).toContain('<xades:ClaimedRole>Emisor</xades:ClaimedRole>');

    const doc = xadesjs.Parse(firmado);
    const nodo = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]!;
    const verificar = new xadesjs.SignedXml(doc);
    verificar.LoadXml(nodo);
    expect(await verificar.Verify()).toBe(true);
  });
});
