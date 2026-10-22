import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Rol } from '@menu-qr/shared';
import { env } from './env';

export const generarTokenQr = () => randomBytes(24).toString('base64url');

// En una tablet vinculada el token lleva el dispositivo y su estación (manda sobre la del usuario).
export type UsuarioToken = {
  id: string;
  rol: Rol;
  restauranteId: string | null;
  dispositivoId?: string;
  estacionId?: string;
};

export function firmarAccessToken(u: UsuarioToken, duracion = env.JWT_ACCESS_TTL) {
  const { rol, restauranteId, dispositivoId, estacionId } = u;
  const tablet = dispositivoId ? { dispositivoId, estacionId } : {};
  return jwt.sign({ rol, restauranteId, ...tablet }, env.JWT_ACCESS_SECRET, {
    subject: u.id,
    expiresIn: duracion as jwt.SignOptions['expiresIn'],
  });
}

// Lanza si el token es inválido o expiró.
export function verificarAccessToken(token: string): UsuarioToken {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  return {
    id: p.sub!,
    rol: p.rol,
    restauranteId: p.restauranteId,
    ...(p.dispositivoId && { dispositivoId: p.dispositivoId, estacionId: p.estacionId }),
  };
}

// El refresh token es opaco y aleatorio; en BD solo se guarda su hash.
export const generarRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
