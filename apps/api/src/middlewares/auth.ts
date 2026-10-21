import type { RequestHandler } from 'express';
import { verificarAccessToken } from '../lib/tokens';
import { HttpError } from './errorHandler';

export const autenticar: RequestHandler = (req, _res, next) => {
  const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'NO_AUTENTICADO', 'Falta el token');
  try {
    req.usuario = verificarAccessToken(token);
  } catch {
    throw new HttpError(401, 'TOKEN_INVALIDO', 'Token inválido o expirado');
  }
  next();
};
