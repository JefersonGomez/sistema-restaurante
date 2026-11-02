import { Router } from 'express';
import {
  claveIngresoSchema,
  crearPedidoSchema,
  idParamSchema,
  llamarSchema,
  pedidoEnLineaSchema,
  personasSchema,
  responderIngresoSchema,
  slugParamSchema,
  tokenParamSchema,
} from '@menu-qr/shared';
import { autenticarCliente } from '../../middlewares/cliente';
import { limiteEnLinea, limitePublico, limiteSesion } from '../../middlewares/rateLimit';
import { cuentaClienteRouter } from '../clientes/clientes.routes';
import * as enLinea from '../enlinea/enlinea.controller';
import { validate } from '../../middlewares/validate';
import * as c from './public.controller';

// /public — sin login de personal, con rate limit.
export const publicRouter = Router();
publicRouter.use(limitePublico);
publicRouter.get('/mesa/:token', validate({ params: tokenParamSchema }), c.mesa);
publicRouter.get('/:slug/menu', validate({ params: slugParamSchema }), c.menu);
// Pedidos en línea (para recoger / a domicilio) y su seguimiento con un token aleatorio.
publicRouter.post(
  '/:slug/pedidos-en-linea',
  limiteEnLinea,
  validate({ params: slugParamSchema, body: pedidoEnLineaSchema }),
  enLinea.crear,
);
// Cuenta opcional del cliente del menú en línea (Fase 8).
publicRouter.use('/:slug/clientes', validate({ params: slugParamSchema }), cuentaClienteRouter);
publicRouter.get(
  '/seguimiento/:token',
  validate({ params: tokenParamSchema }),
  enLinea.seguimiento,
);
// Mesa con el cupo lleno: pedir unirse y consultar la respuesta (con la clave de la solicitud).
publicRouter.post(
  '/mesa/:token/ingreso',
  validate({ params: tokenParamSchema }),
  c.solicitarIngreso,
);
publicRouter.post(
  '/mesa/:token/ingreso/:id',
  validate({ params: tokenParamSchema.extend(idParamSchema.shape), body: claveIngresoSchema }),
  c.estadoIngreso,
);

// /public/cuenta — comensal con token de sesión de cliente.
const cuenta = Router();
cuenta.use(autenticarCliente, limiteSesion);
cuenta.get('/', c.verCuenta);
cuenta.post('/pedidos', validate({ body: crearPedidoSchema }), c.pedir);
cuenta.post('/llamar', validate({ body: llamarSchema }), c.llamar);
cuenta.post('/solicitar', c.solicitar);
cuenta.post('/vistas/:id', validate({ params: idParamSchema }), c.vista);
cuenta.post('/personas', validate({ body: personasSchema }), c.personas);
cuenta.post(
  '/ingresos/:id',
  validate({ params: idParamSchema, body: responderIngresoSchema }),
  c.responderIngreso,
);
cuenta.post('/desbloquear-ingreso', c.desbloquearIngreso);
publicRouter.use('/cuenta', cuenta);
