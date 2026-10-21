import { rateLimit } from 'express-rate-limit';
import { env } from '../lib/env';
import { HttpError } from './errorHandler';

const crear = (limit: number, minutos: number, soloFallidos = false) =>
  rateLimit({
    windowMs: minutos * 60 * 1000,
    limit,
    skipSuccessfulRequests: soloFallidos,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // En tests se desactiva para que no interfiera entre casos.
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes, intente luego')),
  });

// ponytail: contador en memoria por proceso; usar un store compartido (Redis) con varias instancias.
export const limitePublico = crear(120, 1);
// Login: 10 intentos fallidos por IP cada 15 min (los exitosos no cuentan).
export const limiteLogin = crear(10, 15, true);
