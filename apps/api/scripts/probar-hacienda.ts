// Prueba de punta a punta contra Hacienda con el emisor de prueba del .env (HACIENDA_*): arma un
// tiquete, lo firma, lo envía y consulta el estado. Uso: pnpm --filter api hacienda:probar [ruta.xml]
import { readFileSync, writeFileSync } from 'node:fs';
import { env } from '../src/lib/env';
import { clave, consecutivo, fechaCR, TIPO_DOC } from '../src/modules/factura/clave';
import { abrirLlave, firmar } from '../src/modules/factura/firma';
import { consultar, enviar, type Credenciales } from '../src/modules/factura/hacienda';
import { identificacionDeUsuario } from '../src/modules/factura/identificacion';
import { construirXml } from '../src/modules/factura/xml';

async function main() {
  const faltan = (
    [
      'HACIENDA_USER',
      'HACIENDA_PASSWORD',
      'HACIENDA_P12_PATH',
      'HACIENDA_P12_PIN',
      'HACIENDA_TEST_UBICACION',
      'HACIENDA_ACTIVITY',
      'HACIENDA_EMISOR_NOMBRE',
      'HACIENDA_EMISOR_CORREO',
      'HACIENDA_EMISOR_OTRAS_SENAS',
    ] as const
  ).filter((k) => !env[k]);
  if (faltan.length) throw new Error(`Faltan en el .env: ${faltan.join(', ')}`);

  const cred: Credenciales = {
    ambiente: env.HACIENDA_ENV,
    usuario: env.HACIENDA_USER!,
    clave: env.HACIENDA_PASSWORD!,
  };
  const id = identificacionDeUsuario(cred.usuario);
  const [provincia, canton, distrito] = env.HACIENDA_TEST_UBICACION!.split('-').map(Number);

  const llave = await abrirLlave(readFileSync(env.HACIENDA_P12_PATH!), env.HACIENDA_P12_PIN!);
  console.log(`Llave abierta. Certificado vence: ${llave.vence.toISOString().slice(0, 10)}`);

  const ahora = new Date();
  // Número de prueba: segundos desde 2026 (no se repite entre corridas).
  const numero = Math.floor((ahora.getTime() - Date.UTC(2026, 0, 1)) / 1000);
  const consec = consecutivo(TIPO_DOC.TIQUETE, numero);
  const laClave = clave({ fecha: ahora, identificacion: id.numero, consecutivo: consec });
  const fecha = fechaCR(ahora).iso;

  const { xml, totalComprobante } = construirXml({
    tipo: 'TE',
    clave: laClave,
    consecutivo: consec,
    fechaEmision: fecha,
    proveedorSistemas: id.numero,
    actividadEmisor: env.HACIENDA_ACTIVITY!,
    emisor: {
      nombre: env.HACIENDA_EMISOR_NOMBRE!,
      identificacion: id,
      ubicacion: {
        provincia: provincia!,
        canton: canton!,
        distrito: distrito!,
        otrasSenas: env.HACIENDA_EMISOR_OTRAS_SENAS!,
      },
      correo: env.HACIENDA_EMISOR_CORREO!,
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
        cabys: '6331000000000',
        detalle: 'Refresco natural',
        cantidad: 1,
        precioUnitario: 150000,
        tarifaIva: 13,
      },
    ],
    preciosIncluyenIva: true,
    servicio: 98230, // 10 % de la base sin IVA (₡9 823,01 → ₡982,30)
    medios: [{ tipo: '01', monto: 1208230 }],
    moneda: 'CRC',
  });
  const firmado = await firmar(xml, llave);
  const ruta = process.argv[2];
  if (ruta) writeFileSync(ruta, firmado);
  console.log(`Tiquete armado y firmado. Clave ${laClave} · total ${totalComprobante / 100000}`);

  await enviar(cred, { clave: laClave, fecha, emisor: id, xmlFirmado: firmado });
  console.log('Hacienda lo recibió (202). Consultando el resultado…');
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const e = await consultar(cred, laClave);
    console.log(`  estado: ${e.estado}`);
    if (e.estado === 'aceptado' || e.estado === 'rechazado') {
      if (e.mensaje) console.log(`  mensaje de Hacienda:\n${e.mensaje}`);
      return;
    }
  }
  console.log('Hacienda todavía no responde; vuelva a consultar más tarde.');
}

main().catch((e: Error & { estado?: number; detalle?: string }) => {
  console.error(`ERROR: ${e.message}${e.estado ? ` (HTTP ${e.estado})` : ''}`);
  if (e.detalle) console.error(`  detalle: ${e.detalle.slice(0, 800)}`);
  process.exitCode = 1;
});
