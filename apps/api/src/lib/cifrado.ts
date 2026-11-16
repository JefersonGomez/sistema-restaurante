import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './env';

// Cifrado simétrico (AES-256-GCM) para guardar en la base las credenciales de Hacienda de cada
// restaurante. Formato: iv.tag.datos en base64url. La llave sale de EINVOICE_SECRET.
function llave() {
  if (!env.EINVOICE_SECRET || env.EINVOICE_SECRET.length < 32)
    throw new Error('Falta EINVOICE_SECRET (32 caracteres o más) para cifrar credenciales');
  return createHash('sha256').update(env.EINVOICE_SECRET).digest();
}

export function cifrar(valor: string | Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(), iv);
  const datos = Buffer.concat([c.update(valor), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64url')).join('.');
}

export function descifrar(texto: string): Buffer {
  const [iv, tag, datos] = texto.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !datos) throw new Error('Dato cifrado con formato inválido');
  const d = createDecipheriv('aes-256-gcm', llave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]);
}
