import { Router } from 'express';
import {
  crearPedidoSchema,
  idParamSchema,
  llamarSchema,
  slugParamSchema,
  tokenParamSchema,
} from '@menu-qr/shared';
import { autenticarCliente } from '../../middlewares/cliente';
import { limitePublico, limiteSesion } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import * as c from './public.controller';

// /public — sin login de personal, con rate limit.
export const publicRouter = Router();
publicRouter.use(limitePublico);
publicRouter.get('/mesa/:token', validate({ params: tokenParamSchema }), c.mesa);
publicRouter.get('/:slug/menu', validate({ params: slugParamSchema }), c.menu);

// /public/cuenta — comensal con token de sesión de cliente.
const cuenta = Router();
cuenta.use(autenticarCliente, limiteSesion);
cuenta.get('/', c.verCuenta);
cuenta.post('/pedidos', validate({ body: crearPedidoSchema }), c.pedir);
cuenta.post('/llamar', validate({ body: llamarSchema }), c.llamar);
cuenta.post('/solicitar', c.solicitar);
cuenta.post('/vistas/:id', validate({ params: idParamSchema }), c.vista);
publicRouter.use('/cuenta', cuenta);
