import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from './env';

// Dónde viven las imágenes. La "clave" es la ruta relativa, p. ej.
// restaurantes/{restauranteId}/platos/{uuid}-320.webp
export interface StorageDriver {
  guardar(clave: string, datos: Buffer, tipo: string): Promise<string>; // devuelve la URL pública
  borrar(clave: string): Promise<void>;
  claveDeUrl(url: string): string | null; // null si la URL no es de este almacenamiento
}

const claveDesde = (base: string, url: string) => {
  const prefijo = base.replace(/\/$/, '') + '/';
  if (!url.startsWith(prefijo)) return null;
  const clave = decodeURIComponent(url.slice(prefijo.length));
  // Nunca salir de la carpeta: nada de "..", rutas absolutas ni barras invertidas.
  return clave.split('/').some((p) => p === '..' || p === '') || clave.includes('\\')
    ? null
    : clave;
};

// Desarrollo: archivos en UPLOADS_DIR, servidos por la API en /uploads.
export class LocalDriver implements StorageDriver {
  constructor(
    private carpeta: string,
    private urlBase: string,
  ) {}
  private ruta(clave: string) {
    const ruta = normalize(join(this.carpeta, clave));
    if (!ruta.startsWith(normalize(this.carpeta))) throw new Error('Clave fuera de la carpeta');
    return ruta;
  }
  async guardar(clave: string, datos: Buffer) {
    const ruta = this.ruta(clave);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, datos);
    return `${this.urlBase}/${clave}`;
  }
  async borrar(clave: string) {
    await rm(this.ruta(clave), { force: true });
  }
  claveDeUrl(url: string) {
    return claveDesde(this.urlBase, url);
  }
}

// Producción: Cloudflare R2 (API compatible con S3).
export class R2Driver implements StorageDriver {
  private s3: S3Client;
  constructor(
    cuenta: string,
    accessKeyId: string,
    secretAccessKey: string,
    private bucket: string,
    private urlPublica: string,
  ) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${cuenta}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  async guardar(clave: string, datos: Buffer, tipo: string) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        Body: datos,
        ContentType: tipo,
        CacheControl: 'public, max-age=31536000, immutable', // cada versión tiene un uuid nuevo
      }),
    );
    return `${this.urlPublica.replace(/\/$/, '')}/${clave}`;
  }
  async borrar(clave: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
  }
  claveDeUrl(url: string) {
    return claveDesde(this.urlPublica, url);
  }
}

export const urlBaseLocal = `${env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`}/uploads`;

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 'r2'
    ? new R2Driver(
        env.R2_ACCOUNT_ID!,
        env.R2_ACCESS_KEY_ID!,
        env.R2_SECRET_ACCESS_KEY!,
        env.R2_BUCKET!,
        env.R2_PUBLIC_URL!,
      )
    : new LocalDriver(env.UPLOADS_DIR, urlBaseLocal);
