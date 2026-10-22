import { Router } from 'express';
import {
  actualizarUsuarioSchema,
  crearUsuarioSchema,
  idParamSchema,
  pinUsuarioSchema,
} from '@menu-qr/shared';
import { fijarPin } from '../dispositivos/dispositivos.controller';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './usuarios.controller';

// /usuarios — personal del restaurante (DUENO)
export const usuariosRouter = Router();
usuariosRouter.use(autenticar, requireRole('DUENO'), tenant);
usuariosRouter.get('/', c.listar);
usuariosRouter.post('/', validate({ body: crearUsuarioSchema }), c.crear);
usuariosRouter.get('/:id', validate({ params: idParamSchema }), c.obtener);
usuariosRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: actualizarUsuarioSchema }),
  c.actualizar,
);
usuariosRouter.delete('/:id', validate({ params: idParamSchema }), c.eliminar);
usuariosRouter.post(
  '/:id/restablecer-password',
  validate({ params: idParamSchema }),
  c.restablecer,
);
usuariosRouter.put(
  '/:id/pin',
  validate({ params: idParamSchema, body: pinUsuarioSchema }),
  fijarPin,
);
