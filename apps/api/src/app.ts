import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './lib/env';
import { errorHandler, noEncontrado } from './middlewares/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import {
  categoriasRouter,
  estacionesRouter,
  platosRouter,
  uploadsRouter,
} from './modules/menu/menu.routes';
import { mesasRouter } from './modules/mesas/mesas.routes';
import { operacionRouter } from './modules/operacion/operacion.routes';
import { health } from './modules/public/public.controller';
import { publicRouter } from './modules/public/public.routes';
import { adminRouter, restauranteRouter } from './modules/restaurantes/restaurantes.routes';
import { usuariosRouter } from './modules/restaurantes/usuarios.routes';
import { reportesRouter } from './modules/reportes/reportes.routes';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', health);
app.use('/auth', authRouter);
app.use('/public', publicRouter);
app.use('/admin/restaurantes', adminRouter);
app.use('/restaurante', restauranteRouter);
app.use('/usuarios', usuariosRouter);
app.use('/estaciones', estacionesRouter);
app.use('/categorias', categoriasRouter);
app.use('/platos', platosRouter);
app.use('/mesas', mesasRouter);
app.use('/uploads', uploadsRouter);
app.use('/operacion', operacionRouter);
app.use('/reportes', reportesRouter);

app.use(noEncontrado);
app.use(errorHandler);
