import { randomUUID } from 'node:crypto';
import sharp, { type Sharp } from 'sharp';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { HttpError, noExiste } from '../../middlewares/errorHandler';

export const TAMANO_MAXIMO = 8 * 1024 * 1024; // 8 MB
const CALIDAD = 78;

type Tipo = 'jpeg' | 'png' | 'webp' | 'heic';

// Tipo real por los primeros bytes (la extensión y el Content-Type los decide el cliente).
export function tipoReal(b: Buffer): Tipo | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (
    b.toString('ascii', 4, 8) === 'ftyp' &&
    /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(b.toString('ascii', 8, 12))
  )
    return 'heic';
  return null;
}

// Gira según EXIF, quita metadatos (sharp no los copia salvo que se pida) y convierte a WebP.
async function aWebp(datos: Buffer, ajuste: (img: Sharp) => Sharp) {
  try {
    return await ajuste(sharp(datos, { failOn: 'error' }).rotate())
      .webp({ quality: CALIDAD })
      .toBuffer();
  } catch {
    throw new HttpError(415, 'IMAGEN_ILEGIBLE', 'No se pudo leer la imagen. Súbala en JPG o PNG.');
  }
}

export async function subirImagen(
  restauranteId: string,
  archivo: Buffer | undefined,
  destino: 'plato' | 'logo',
) {
  if (!archivo?.length)
    throw new HttpError(400, 'SIN_ARCHIVO', 'Adjunte una imagen en el campo "imagen"');
  const tipo = tipoReal(archivo);
  if (!tipo)
    throw new HttpError(
      415,
      'TIPO_NO_SOPORTADO',
      'El archivo no es una imagen JPG, PNG, WEBP o HEIC',
    );

  const id = randomUUID();
  const carpeta = `restaurantes/${restauranteId}`;
  if (destino === 'logo') {
    // Logo: sin recorte, máximo 512 px por lado.
    const logo = await aWebp(archivo, (img) =>
      img.resize(512, 512, { fit: 'inside', withoutEnlargement: true }),
    );
    return { url: await storage.guardar(`${carpeta}/logo/${id}.webp`, logo, 'image/webp') };
  }
  // Plato: cuadrado centrado en 320 px (lista) y 960 px (detalle).
  const cuadrado = (n: number) => (img: Sharp) =>
    img.resize(n, n, { fit: 'cover', position: 'centre' });
  const [chica, grande] = await Promise.all([
    aWebp(archivo, cuadrado(320)),
    aWebp(archivo, cuadrado(960)),
  ]);
  const [url320, url960] = await Promise.all([
    storage.guardar(`${carpeta}/platos/${id}-320.webp`, chica, 'image/webp'),
    storage.guardar(`${carpeta}/platos/${id}-960.webp`, grande, 'image/webp'),
  ]);
  return { url320, url960 };
}

// Solo se borran archivos del propio restaurante (la clave empieza con su carpeta).
const clavePropia = (restauranteId: string, url: string | null | undefined) => {
  const clave = url ? storage.claveDeUrl(url) : null;
  return clave?.startsWith(`restaurantes/${restauranteId}/`) ? clave : null;
};

// Borra en silencio las imágenes viejas (p. ej. al reemplazar la foto de un plato).
export async function borrarImagenes(restauranteId: string, urls: (string | null | undefined)[]) {
  for (const url of urls) {
    const clave = clavePropia(restauranteId, url);
    if (clave) await storage.borrar(clave).catch(() => {});
  }
}

// Borrado explícito (imagen subida y descartada antes de guardar el plato).
export async function borrarImagen(restauranteId: string, url: string) {
  const clave = clavePropia(restauranteId, url);
  if (!clave) throw noExiste('Imagen');
  const enUso =
    (await prisma.plato.count({
      where: { restauranteId, OR: [{ fotoUrl: url }, { fotoMiniUrl: url }] },
    })) + (await prisma.restaurante.count({ where: { id: restauranteId, logoUrl: url } }));
  if (enUso)
    throw new HttpError(409, 'EN_USO', 'La imagen está en uso; cámbiela en el plato o el logo');
  await storage.borrar(clave);
}
