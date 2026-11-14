import { Router } from 'express';
import { horariosSchema, restauranteConfigSchema } from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './restaurantes.controller';

// /restaurante — configuración del restaurante propio (DUENO)
export const restauranteRouter = Router();
restauranteRouter.use(autenticar, requireRole('DUENO'), tenant);
restauranteRouter.get('/', c.obtenerPropio);
restauranteRouter.get('/suscripcion', c.suscripcion);
restauranteRouter.patch('/', validate({ body: restauranteConfigSchema }), c.actualizarPropio);
restauranteRouter.put('/horarios', validate({ body: horariosSchema }), c.guardarHorarios);
restauranteRouter.get('/qr-enlinea.png', c.qrEnLinea);
restauranteRouter.get('/menu.pdf', c.menuPdf);
