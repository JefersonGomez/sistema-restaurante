import { Router } from 'express';
import { loginSchema } from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import * as c from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', validate({ body: loginSchema }), c.login);
authRouter.post('/refresh', c.refresh);
authRouter.post('/logout', c.logout);
authRouter.get('/me', autenticar, c.me);
