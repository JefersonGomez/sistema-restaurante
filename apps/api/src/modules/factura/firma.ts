import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom';
import forge from 'node-forge';
import * as xadesjs from 'xadesjs';

// Firma XAdES-EPES que exige Hacienda: RSA-SHA256, referencia al documento (enveloped), certificado
// en KeyInfo, SigningCertificate, política de firma de Hacienda con su hash y rol "Emisor".
const POLITICA = {
  url: 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf',
  // SHA-256 del PDF de la política (verificado contra el archivo publicado por Hacienda).
  hash: 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=',
};

let listo = false;
function preparar() {
  if (listo) return;
  xadesjs.Application.setEngine('NodeJS', globalThis.crypto);
  xadesjs.setNodeDependencies({ DOMParser, XMLSerializer, DOMImplementation });
  listo = true;
}

export type Llave = { privada: CryptoKey; certificadoB64: string; vence: Date; sujeto: string };

// Abre la llave criptográfica (.p12) con su PIN.
export async function abrirLlave(p12: Buffer, pin: string): Promise<Llave> {
  preparar();
  let archivo: forge.pkcs12.Pkcs12Pfx;
  try {
    archivo = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString('binary')), pin);
  } catch {
    throw new Error('No se pudo abrir la llave criptográfica: revise el archivo y el PIN');
  }
  const bolsa = (tipo: string) => archivo.getBags({ bagType: tipo })[tipo] ?? [];
  const llave = [...bolsa(forge.pki.oids.pkcs8ShroudedKeyBag!), ...bolsa(forge.pki.oids.keyBag!)][0]
    ?.key;
  // El .p12 de Hacienda trae la cadena: el del firmante es el que no es una autoridad (CA).
  const certs = bolsa(forge.pki.oids.certBag!)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  const cert =
    certs.find((c) => !(c.getExtension('basicConstraints') as { cA?: boolean } | undefined)?.cA) ??
    certs[0];
  if (!llave || !cert)
    throw new Error('La llave criptográfica no trae llave privada o certificado');

  const pkcs8 = forge.asn1
    .toDer(
      forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(llave as forge.pki.rsa.PrivateKey)),
    )
    .getBytes();
  const privada = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(pkcs8, 'binary'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    privada,
    certificadoB64: Buffer.from(der, 'binary').toString('base64'),
    vence: cert.validity.notAfter,
    sujeto: cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(', '),
  };
}

// Devuelve el XML con la firma <ds:Signature> al final del elemento raíz.
export async function firmar(xml: string, llave: Llave) {
  preparar();
  const documento = xadesjs.Parse(xml);
  const firma = new xadesjs.SignedXml();
  await firma.Sign({ name: 'RSASSA-PKCS1-v1_5' }, llave.privada, documento, {
    references: [{ uri: '', hash: 'SHA-256', transforms: ['enveloped'] }],
    x509: [llave.certificadoB64],
    signingCertificate: llave.certificadoB64,
    policy: {
      hash: 'SHA-256',
      identifier: { value: POLITICA.url },
      digestValue: POLITICA.hash,
    },
    signerRole: { claimed: ['Emisor'] },
  });
  documento.documentElement!.appendChild(firma.GetXml()!);
  return new XMLSerializer().serializeToString(documento as never);
}
