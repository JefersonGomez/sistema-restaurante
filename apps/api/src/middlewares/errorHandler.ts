import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { env } from '../lib/env';
import { logger } from '../lib/logger';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const noEncontrado: RequestHandler = (req) => {
  throw new HttpError(404, 'NO_ENCONTRADO', `Ruta no encontrada: ${req.method} ${req.path}`);
};

const esPrisma = (err: unknown, code: string) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let e: HttpError;
  if (err instanceof HttpError) e = err;
  else if (err instanceof ZodError)
    e = new HttpError(400, 'VALIDACION', 'Datos inválidos', z.flattenError(err));
  else if (esPrisma(err, 'P2002'))
    e = new HttpError(409, 'DUPLICADO', 'Ya existe un registro con esos datos');
  else if (esPrisma(err, 'P2025')) e = new HttpError(404, 'NO_ENCONTRADO', 'Recurso no encontrado');
  else if (err?.type === 'entity.parse.failed')
    e = new HttpError(400, 'JSON_INVALIDO', 'El cuerpo no es JSON válido');
  else {
    logger.error(err);
    // En producción nunca se expone el detalle del error.
    const message = env.NODE_ENV === 'production' ? 'Error interno' : String(err?.message ?? err);
    e = new HttpError(500, 'ERROR_INTERNO', message);
  }
  res.status(e.status).json({
    error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
  });
};
