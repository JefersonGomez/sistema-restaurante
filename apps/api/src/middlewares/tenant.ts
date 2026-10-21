import type { RequestHandler } from 'express';
import { HttpError } from './errorHandler';

// El restauranteId sale SOLO del JWT; nunca de body, query o params.
export const tenant: RequestHandler = (req, _res, next) => {
  const restauranteId = req.usuario?.restauranteId;
  if (!restauranteId)
    throw new HttpError(403, 'SIN_RESTAURANTE', 'El usuario no pertenece a un restaurante');
  req.tenant = { restauranteId };
  next();
};
