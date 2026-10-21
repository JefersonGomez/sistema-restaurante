import { Router } from 'express';
import { slugParamSchema, tokenParamSchema } from '@menu-qr/shared';
import { limitePublico } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import * as c from './public.controller';

// /public — sin login, con rate limit.
export const publicRouter = Router();
publicRouter.use(limitePublico);
publicRouter.get('/mesa/:token', validate({ params: tokenParamSchema }), c.mesa);
publicRouter.get('/:slug/menu', validate({ params: slugParamSchema }), c.menu);
