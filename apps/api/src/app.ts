import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './lib/env';
import { errorHandler, noEncontrado } from './middlewares/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { categoriasRouter, estacionesRouter, platosRouter } from './modules/menu/menu.routes';
import { uploadsRouter } from './modules/uploads/uploads.routes';
import { mesasRouter } from './modules/mesas/mesas.routes';
import { operacionRouter } from './modules/operacion/operacion.routes';
import { health } from './modules/public/public.controller';
import { publicRouter } from './modules/public/public.routes';
import { restauranteRouter } from './modules/restaurantes/restaurantes.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { usuariosRouter } from './modules/restaurantes/usuarios.routes';
import { reportesRouter } from './modules/reportes/reportes.routes';
import { dispositivosRouter } from './modules/dispositivos/dispositivos.routes';
import { clientesRouter } from './modules/clientes/clientes.routes';
import { enLineaRouter, repartosRouter } from './modules/enlinea/enlinea.routes';
import { cajaRouter } from './modules/caja/caja.routes';
import { comprobantesRouter, haciendaRouter } from './modules/factura/factura.routes';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Imágenes en disco (STORAGE_DRIVER=local). Con R2 las sirve Cloudflare.
if (env.STORAGE_DRIVER === 'local')
  app.use(
    '/uploads',
    express.static(env.UPLOADS_DIR, {
      maxAge: '1y',
      immutable: true, // cada versión tiene un uuid nuevo
      // helmet pone same-origin; el menú (otro puerto/dominio) tiene que poder cargarlas.
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );

app.get('/health', health);
app.use('/auth', authRouter);
app.use('/public', publicRouter);
app.use('/admin', adminRouter);
app.use('/restaurante', restauranteRouter);
app.use('/usuarios', usuariosRouter);
app.use('/estaciones', estacionesRouter);
app.use('/categorias', categoriasRouter);
app.use('/platos', platosRouter);
app.use('/mesas', mesasRouter);
app.use('/uploads', uploadsRouter);
app.use('/operacion', operacionRouter);
app.use('/reportes', reportesRouter);
app.use('/dispositivos', dispositivosRouter);
app.use('/enlinea', enLineaRouter);
app.use('/repartos', repartosRouter);
app.use('/clientes', clientesRouter);
app.use('/caja', cajaRouter);
app.use('/comprobantes', comprobantesRouter);
app.use('/hacienda', haciendaRouter);

app.use(noEncontrado);
app.use(errorHandler);
