import { Router } from 'express';
import {
  abrirCajaSchema,
  cerrarCajaSchema,
  idParamSchema,
  movimientoCajaSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './caja.controller';

// /caja — arqueo de caja (Fase 14): caja y dueño
export const cajaRouter = Router();
cajaRouter.use(autenticar, requireRole('DUENO', 'CAJA'), tenant);
cajaRouter.get('/turno', c.actual);
cajaRouter.post('/turno/abrir', validate({ body: abrirCajaSchema }), c.abrir);
cajaRouter.post('/turno/movimientos', validate({ body: movimientoCajaSchema }), c.movimiento);
cajaRouter.post('/turno/cerrar', validate({ body: cerrarCajaSchema }), c.cerrar);
cajaRouter.get('/turnos', c.cierres);
cajaRouter.get('/turnos/:id', validate({ params: idParamSchema }), c.obtener);
