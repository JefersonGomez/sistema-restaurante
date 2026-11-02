import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../lib/env';
import { HttpError } from './errorHandler';

const crear = (
  limit: number,
  minutos: number,
  opciones: { soloFallidos?: boolean; clave?: (req: Request) => string } = {},
) =>
  rateLimit({
    windowMs: minutos * 60 * 1000,
    limit,
    skipSuccessfulRequests: opciones.soloFallidos ?? false,
    keyGenerator: opciones.clave ?? ((req) => ipKeyGenerator(req.ip ?? '')),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // En tests se desactiva para que no interfiera entre casos.
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiadas solicitudes, intente luego')),
  });

// ponytail: contadores en memoria por proceso; usar un store compartido (Redis) con varias instancias.

// Por IP. Alto porque todos los celulares de un restaurante salen por la misma IP del Wi-Fi.
export const limitePublico = crear(1200, 1);
// Por sesión de comensal (rutas /public/cuenta): frena a un celular sin afectar a los demás.
export const limiteSesion = crear(60, 1, { clave: (req) => `sesion:${req.cliente!.sesionId}` });
// Login: 10 intentos fallidos por IP cada 15 min (los exitosos no cuentan).
export const limiteLogin = crear(10, 15, { soloFallidos: true });
// Vincular tablet: 10 códigos fallidos por IP cada 15 min (son solo 6 dígitos).
export const limiteVincular = crear(10, 15, { soloFallidos: true });
// PIN: 20 fallidos por tablet cada 15 min (además del bloqueo de 5 intentos por persona).
export const limitePin = crear(20, 15, {
  soloFallidos: true,
  clave: (req) => `disp:${req.get('x-dispositivo') ?? ipKeyGenerator(req.ip ?? '')}`,
});
// Registro de restaurantes: 5 por IP cada hora (cuenten o no).
export const limiteRegistro = crear(5, 60);
// Pedidos en línea: 10 por IP cada 10 minutos.
export const limiteEnLinea = crear(10, 10);
// Cuentas de clientes del menú en línea: 10 entradas fallidas por IP cada 15 min y 10 cuentas
// nuevas por IP cada hora (contadores propios, separados del login del personal).
export const limiteLoginCliente = crear(10, 15, { soloFallidos: true });
export const limiteRegistroCliente = crear(10, 60);
