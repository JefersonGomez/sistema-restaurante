import { Router } from 'express';
import {
  codigoDispositivoSchema,
  entrarConPinSchema,
  idParamSchema,
  vincularDispositivoSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { limitePin, limiteVincular } from '../../middlewares/rateLimit';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './dispositivos.controller';

// /dispositivos — tablets de cocina/bar
export const dispositivosRouter = Router();

// Tablet (sin usuario): se identifica con el token del dispositivo en `X-Dispositivo`.
dispositivosRouter.post(
  '/vincular',
  limiteVincular,
  validate({ body: vincularDispositivoSchema }),
  c.vincular,
);
dispositivosRouter.get('/tablet', limitePin, c.yo);
dispositivosRouter.post(
  '/tablet/entrar',
  limitePin,
  validate({ body: entrarConPinSchema }),
  c.entrar,
);

// Dueño
const dueno = [autenticar, requireRole('DUENO'), tenant];
dispositivosRouter.get('/', dueno, c.listar);
dispositivosRouter.post(
  '/codigo',
  dueno,
  validate({ body: codigoDispositivoSchema }),
  c.crearCodigo,
);
dispositivosRouter.delete('/:id', dueno, validate({ params: idParamSchema }), c.revocar);
