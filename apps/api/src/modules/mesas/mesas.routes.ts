import { Router } from 'express';
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
mesasRouter.get('/:id', conId, c.obtener);
mesasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: actualizarMesaSchema }),
  c.actualizar,
);
mesasRouter.delete('/:id', conId, c.eliminar);
mesasRouter.post('/:id/regenerar-token', conId, c.regenerarToken);
mesasRouter.get('/:id/qr', validate({ params: idParamSchema, query: qrQuerySchema }), c.qr);
