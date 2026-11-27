import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { HttpError } from './errorHandler';

// Lo que no se puede hacer en una demo (Fase 21): Hacienda real, correos, cambiar contraseña.
// Usar después de `autenticar`.
export const sinDemo: RequestHandler = async (req, _res, next) => {
  const restauranteId = req.usuario?.restauranteId;
  const r = restauranteId
    ? await prisma.restaurante.findUnique({
        where: { id: restauranteId },
        select: { esDemo: true },
      })
    : null;
  if (r?.esDemo)
    throw new HttpError(
      403,
      'DEMO_NO_PERMITIDO',
      'Esto no está disponible en la demo. Cree su cuenta gratis para usarlo.',
    );
  next();
};
