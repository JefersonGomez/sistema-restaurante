import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Rol } from '@menu-qr/shared';
import { env } from './env';

export const generarTokenQr = () => randomBytes(24).toString('base64url');

export type UsuarioToken = { id: string; rol: Rol; restauranteId: string | null };

export function firmarAccessToken(u: UsuarioToken) {
  return jwt.sign({ rol: u.rol, restauranteId: u.restauranteId }, env.JWT_ACCESS_SECRET, {
    subject: u.id,
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

// Lanza si el token es inválido o expiró.
export function verificarAccessToken(token: string): UsuarioToken {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  return { id: p.sub!, rol: p.rol, restauranteId: p.restauranteId };
}

// El refresh token es opaco y aleatorio; en BD solo se guarda su hash.
export const generarRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
