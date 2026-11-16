// Carga en un restaurante la configuración de Hacienda del emisor de prueba del .env (HACIENDA_*),
// cifrada, y la activa. Uso: pnpm --filter api hacienda:configurar <slug> [--desactivar]
import { readFileSync } from 'node:fs';
import { cifrar } from '../src/lib/cifrado';
import { env } from '../src/lib/env';
import { prisma } from '../src/lib/prisma';
import { abrirLlave } from '../src/modules/factura/firma';
import { identificacionDeUsuario } from '../src/modules/factura/identificacion';

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error('Indique el slug del restaurante, p. ej. soda-la-esquina');
  const r = await prisma.restaurante.findUnique({ where: { slug } });
  if (!r) throw new Error(`No existe el restaurante ${slug}`);

  if (process.argv.includes('--desactivar')) {
    await prisma.configHacienda.updateMany({
      where: { restauranteId: r.id },
      data: { activa: false },
    });
    console.log(`Factura electrónica desactivada en ${r.nombre}.`);
    return;
  }

  const req = (k: keyof typeof env) => {
    const v = env[k];
    if (!v) throw new Error(`Falta ${k} en el .env`);
    return String(v);
  };
  const usuario = req('HACIENDA_USER');
  const p12 = readFileSync(req('HACIENDA_P12_PATH'));
  const pin = req('HACIENDA_P12_PIN');
  const llave = await abrirLlave(p12, pin); // falla aquí si el PIN no corresponde
  const id = identificacionDeUsuario(usuario);
  const [provincia, canton, distrito] = req('HACIENDA_TEST_UBICACION').split('-').map(Number);

  const datos = {
    activa: true,
    ambiente: env.HACIENDA_ENV,
    tipoId: id.tipo,
    numeroId: id.numero,
    nombre: req('HACIENDA_EMISOR_NOMBRE'),
    nombreComercial: r.nombre,
    correo: req('HACIENDA_EMISOR_CORREO'),
    provincia: provincia!,
    canton: canton!,
    distrito: distrito!,
    otrasSenas: req('HACIENDA_EMISOR_OTRAS_SENAS'),
    actividad: req('HACIENDA_ACTIVITY'),
    usuarioCifrado: cifrar(usuario),
    claveCifrada: cifrar(req('HACIENDA_PASSWORD')),
    llaveCifrada: cifrar(p12),
    pinCifrado: cifrar(pin),
  };
  // Consecutivo de prueba alto para no chocar con los números usados por hacienda:probar.
  const inicio = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000);
  await prisma.configHacienda.upsert({
    where: { restauranteId: r.id },
    create: {
      ...datos,
      restauranteId: r.id,
      siguienteTiquete: inicio,
      siguienteFactura: inicio,
      siguienteNota: inicio,
    },
    update: datos,
  });
  console.log(
    `Factura electrónica activa en ${r.nombre} (${env.HACIENDA_ENV}). Llave vence ${llave.vence.toISOString().slice(0, 10)}.`,
  );
  if (!r.cabysGeneral) console.log('Aviso: falta el código CABYS general en Ajustes.');
}

main()
  .catch((e: Error) => {
    console.error(`ERROR: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
