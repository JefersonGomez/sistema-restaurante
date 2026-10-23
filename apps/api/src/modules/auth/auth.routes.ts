import { Router } from 'express';
import { cambiarPasswordSchema, loginSchema, registroSchema } from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { limiteLogin, limiteRegistro } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import * as c from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', limiteLogin, validate({ body: loginSchema }), c.login);
authRouter.post('/registro', limiteRegistro, validate({ body: registroSchema }), c.registro);
authRouter.post('/refresh', c.refresh);
authRouter.post('/logout', c.logout);
authRouter.get('/me', autenticar, c.me);
authRouter.post(
  '/cambiar-password',
  autenticar,
  validate({ body: cambiarPasswordSchema }),
  c.cambiarPassword,
);
