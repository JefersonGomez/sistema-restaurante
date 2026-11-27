// Sube a Backblaze B2 (API compatible con S3) un respaldo ya cifrado que llega por la entrada
// estándar (Fase 22). Lo usa deploy/respaldo.sh en el VPS:
//   docker compose exec -T api pnpm exec tsx scripts/subir-respaldo.ts <nombre> < archivo.enc
// Variables: B2_KEY_ID, B2_APP_KEY, B2_BUCKET, B2_ENDPOINT (p. ej. https://s3.us-east-005.backblazeb2.com).
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const { B2_KEY_ID, B2_APP_KEY, B2_BUCKET, B2_ENDPOINT } = process.env;
const nombre = process.argv[2];

async function main() {
  if (!nombre) throw new Error('Falta el nombre del archivo en B2');
  if (!B2_KEY_ID || !B2_APP_KEY || !B2_BUCKET || !B2_ENDPOINT) {
    console.log('B2 sin configurar: el respaldo queda solo en el VPS.');
    return;
  }
  const partes: Buffer[] = [];
  for await (const p of process.stdin) partes.push(p as Buffer);
  const datos = Buffer.concat(partes);
  if (!datos.length) throw new Error('El respaldo llegó vacío');

  // La región va en el endpoint: s3.<region>.backblazeb2.com
  const region = new URL(B2_ENDPOINT).hostname.split('.')[1] ?? 'us-east-005';
  const s3 = new S3Client({
    region,
    endpoint: B2_ENDPOINT,
    credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APP_KEY },
  });
  await s3.send(new PutObjectCommand({ Bucket: B2_BUCKET, Key: nombre, Body: datos }));
  const subido = await s3.send(new HeadObjectCommand({ Bucket: B2_BUCKET, Key: nombre }));
  if (subido.ContentLength !== datos.length) throw new Error('El tamaño en B2 no coincide');
  console.log(`Subido a B2: ${nombre} (${datos.length} bytes)`);
}

main().catch((e) => {
  console.error('No se pudo subir el respaldo a B2:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
