import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { verificarAccessToken } from '../lib/tokens';
import { HttpError } from './errorHandler';

export const autenticar: RequestHandler = async (req, _res, next) => {
  const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'NO_AUTENTICADO', 'Falta el token');
  try {
    req.usuario = verificarAccessToken(token);
  } catch {
    throw new HttpError(401, 'TOKEN_INVALIDO', 'Token inválido o expirado');
  }
  // Sesión abierta en una tablet: deja de servir en cuanto el dueño revoca el dispositivo.
  if (req.usuario.dispositivoId && !(await dispositivoVigente(req.usuario.dispositivoId)))
    throw new HttpError(401, 'DISPOSITIVO_REVOCADO', 'Esta tablet fue desvinculada');
  next();
};

export const dispositivoVigente = async (id: string) =>
  !!(await prisma.dispositivo.findFirst({
    where: { id, revocado: false, vinculadoEn: { not: null } },
    select: { id: true },
  }));
