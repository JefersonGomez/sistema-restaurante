import { Router } from 'express';
import {
  buscarClientesSchema,
  cambiarPasswordClienteSchema,
  canjearSchema,
  loginClienteSchema,
  olvideSchema,
  perfilClienteSchema,
  registroClienteSchema,
  restablecerSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import {
  limiteLoginCliente,
  limiteOlvide,
  limiteRegistroCliente,
  limiteRestablecer,
} from '../../middlewares/rateLimit';
import { requireRole } from '../../middlewares/roles';
import { planCompleto } from '../../middlewares/plan';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './clientes.controller';

// /public/:slug/clientes — cuenta del cliente del menú en línea (va dentro de /public: rate limit).
export const cuentaClienteRouter = Router({ mergeParams: true });
cuentaClienteRouter.post(
  '/registro',
  limiteRegistroCliente,
  validate({ body: registroClienteSchema }),
  c.registrar,
);
cuentaClienteRouter.post(
  '/entrar',
  limiteLoginCliente,
  validate({ body: loginClienteSchema }),
  c.entrar,
);
cuentaClienteRouter.post('/olvide', limiteOlvide, validate({ body: olvideSchema }), c.olvide);
cuentaClienteRouter.post(
  '/restablecer',
  limiteRestablecer,
  validate({ body: restablecerSchema }),
  c.restablecer,
);
cuentaClienteRouter.use(c.autenticarRegistrado);
cuentaClienteRouter.get('/yo', c.perfil);
cuentaClienteRouter.put('/yo', validate({ body: perfilClienteSchema }), c.actualizarPerfil);
cuentaClienteRouter.post(
  '/yo/password',
  validate({ body: cambiarPasswordClienteSchema }),
  c.cambiarPassword,
);
cuentaClienteRouter.post('/salir', c.salir);

// /clientes — lista para el dueño; canjear el premio también desde "En línea".
export const clientesRouter = Router();
clientesRouter.use(autenticar, requireRole('DUENO', 'CAJA', 'MESERO'), tenant, planCompleto);
clientesRouter.get('/', requireRole('DUENO'), validate({ query: buscarClientesSchema }), c.listar);
clientesRouter.post('/canjear', validate({ body: canjearSchema }), c.canjear);
