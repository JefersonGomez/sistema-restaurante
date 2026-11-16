import { Router } from 'express';
import { configHaciendaSchema, contribuyenteQuerySchema, idParamSchema } from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './factura.controller';

// /comprobantes — caja y dueño: estado de la factura electrónica de cada cobro.
export const comprobantesRouter = Router();
comprobantesRouter.use(autenticar, requireRole('DUENO', 'CAJA'), tenant);
comprobantesRouter.get('/', c.listar);
comprobantesRouter.get(
  '/contribuyente',
  validate({ query: contribuyenteQuerySchema }),
  c.contribuyente,
);
comprobantesRouter.post('/:id/reintentar', validate({ params: idParamSchema }), c.reintentar);

// /hacienda — dueño: datos de Hacienda del restaurante.
export const haciendaRouter = Router();
haciendaRouter.use(autenticar, requireRole('DUENO'), tenant);
haciendaRouter.get('/config', c.obtenerConfig);
haciendaRouter.put('/config', validate({ body: configHaciendaSchema }), c.guardarConfig);
haciendaRouter.post('/probar', c.probar);
