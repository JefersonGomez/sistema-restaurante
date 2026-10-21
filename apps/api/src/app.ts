import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './lib/env';
import { errorHandler, noEncontrado } from './middlewares/errorHandler';
import { authRouter } from './modules/auth/auth.routes';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/auth', authRouter);

app.use(noEncontrado);
app.use(errorHandler);
