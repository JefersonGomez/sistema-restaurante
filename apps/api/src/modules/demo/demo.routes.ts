import { Router } from 'express';
import { demoRolSchema } from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { limiteDemo } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import * as c from './demo.controller';

// /demo — demo de una visita (Fase 21). Crear es público; lo demás, dentro de la demo.
export const demoRouter = Router();
demoRouter.post('/', limiteDemo, validate({ body: demoRolSchema }), c.crear);
demoRouter.get('/', autenticar, c.info);
demoRouter.post('/rol', autenticar, validate({ body: demoRolSchema }), c.cambiarRol);
