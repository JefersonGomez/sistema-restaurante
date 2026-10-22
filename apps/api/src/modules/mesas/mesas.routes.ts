import { Router } from 'express';
import { z } from 'zod';
import { actualizarMesaSchema, idParamSchema, mesaSchema, qrQuerySchema } from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './mesas.controller';

const conId = validate({ params: idParamSchema });

// /mesas (DUENO)
export const mesasRouter = Router();
mesasRouter.use(autenticar, requireRole('DUENO'), tenant);
mesasRouter.get('/', c.listar);
mesasRouter.post('/', validate({ body: mesaSchema }), c.crear);
// Antes de '/:id'.
mesasRouter.post(
  '/lote',
  validate({
    body: z
      .object({
        desde: z.number().int().min(1).max(9999),
        hasta: z.number().int().min(1).max(9999),
      })
      .refine(
        (r) => r.hasta >= r.desde && r.hasta - r.desde < 200,
        'Rango inválido (máximo 200 mesas)',
      ),
  }),
  c.crearLote,
);
mesasRouter.get(
  '/qr.pdf',
  validate({
    query: z.object({
      ids: z
        .string()
        .transform((s) => s.split(',').filter(Boolean))
        .pipe(z.array(z.uuid()).min(1).max(200))
        .optional(),
      formato: z.enum(['tarjetas', 'acrilico']).default('tarjetas'),
    }),
  }),
  c.pdfQr,
);
mesasRouter.get('/:id', conId, c.obtener);
mesasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: actualizarMesaSchema }),
  c.actualizar,
);
mesasRouter.delete('/:id', conId, c.eliminar);
mesasRouter.post('/:id/regenerar-token', conId, c.regenerarToken);
mesasRouter.get('/:id/qr', validate({ params: idParamSchema, query: qrQuerySchema }), c.qr);
