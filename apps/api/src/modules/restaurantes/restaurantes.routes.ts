import { Router } from 'express';
import {
  adminRestaurantePatchSchema,
  crearRestauranteSchema,
  idParamSchema,
  restauranteConfigSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './restaurantes.controller';

// /admin/restaurantes — solo SUPERADMIN
export const adminRouter = Router();
adminRouter.use(autenticar, requireRole('SUPERADMIN'));
adminRouter.post('/', validate({ body: crearRestauranteSchema }), c.crear);
adminRouter.get('/', c.listar);
adminRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: adminRestaurantePatchSchema }),
  c.actualizarAdmin,
);

// /restaurante — configuración del restaurante propio (DUENO)
export const restauranteRouter = Router();
restauranteRouter.use(autenticar, requireRole('DUENO'), tenant);
restauranteRouter.get('/', c.obtenerPropio);
restauranteRouter.patch('/', validate({ body: restauranteConfigSchema }), c.actualizarPropio);
