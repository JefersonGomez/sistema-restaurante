import type { RequestHandler } from 'express';
import { incluyeEnLinea } from '@menu-qr/shared';
import { prisma } from '../lib/prisma';
import { HttpError } from './errorHandler';

// Pedidos en línea, repartidores y clientes son del plan Completo. Usar después de `tenant`.
export const planCompleto: RequestHandler = async (req, _res, next) => {
  const r = await prisma.restaurante.findUnique({
    where: { id: req.tenant!.restauranteId },
    select: { plan: true },
  });
  if (!r || !incluyeEnLinea(r.plan))
    throw new HttpError(403, 'PLAN_NO_INCLUYE', 'Su plan no incluye pedidos en línea ni clientes');
  next();
};
