import { Router } from 'express';
import {
  adminRestaurantePatchSchema,
  buscarRestaurantesSchema,
  crearRestauranteSchema,
  idParamSchema,
  registrarPagoSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { validate } from '../../middlewares/validate';
import * as c from './admin.controller';

// /admin — solo SUPERADMIN (dueño de la plataforma)
export const adminRouter = Router();
adminRouter.use(autenticar, requireRole('SUPERADMIN'));
const conId = validate({ params: idParamSchema });
adminRouter.get('/resumen', c.resumen);
adminRouter.get('/restaurantes', validate({ query: buscarRestaurantesSchema }), c.listar);
adminRouter.post('/restaurantes', validate({ body: crearRestauranteSchema }), c.crear);
adminRouter.get('/restaurantes/:id', conId, c.detalle);
adminRouter.patch(
  '/restaurantes/:id',
  validate({ params: idParamSchema, body: adminRestaurantePatchSchema }),
  c.actualizar,
);
adminRouter.post(
  '/restaurantes/:id/pagos',
  validate({ params: idParamSchema, body: registrarPagoSchema }),
  c.registrarPago,
);
adminRouter.post('/restaurantes/:id/restablecer-dueno', conId, c.restablecerDueno);
