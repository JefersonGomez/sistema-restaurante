import type { RequestHandler } from 'express';
import { incluyeEnLinea, incluyeMesas } from '@menu-qr/shared';
import { prisma } from '../lib/prisma';
import { HttpError } from './errorHandler';

// Pedidos en línea, repartidores y clientes: planes Completo y Solo en línea. Usar después de `tenant`.
export const planCompleto: RequestHandler = async (req, _res, next) => {
  const r = await prisma.restaurante.findUnique({
    where: { id: req.tenant!.restauranteId },
    select: { plan: true },
  });
  if (!r || !incluyeEnLinea(r.plan))
    throw new HttpError(403, 'PLAN_NO_INCLUYE', 'Su plan no incluye pedidos en línea ni clientes');
  next();
};

// Mesas y QR de mesa: no están en el plan Solo en línea (Fase 20.6). Usar después de `tenant`.
export const planConMesas: RequestHandler = async (req, _res, next) => {
  const r = await prisma.restaurante.findUnique({
    where: { id: req.tenant!.restauranteId },
    select: { plan: true },
  });
  if (!r || !incluyeMesas(r.plan))
    throw new HttpError(
      403,
      'PLAN_NO_INCLUYE',
      'Su plan es solo para pedidos en línea: no incluye mesas',
    );
  next();
};
