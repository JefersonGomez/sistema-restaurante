import type { RequestHandler } from 'express';
import type { Rol } from '@menu-qr/shared';
import { HttpError } from './errorHandler';

// Usar después de `autenticar`.
export const requireRole =
  (...roles: Rol[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.usuario) throw new HttpError(401, 'NO_AUTENTICADO', 'Falta el token');
    if (!roles.includes(req.usuario.rol))
      throw new HttpError(403, 'PROHIBIDO', 'No tiene permiso para esta acción');
    next();
  };
