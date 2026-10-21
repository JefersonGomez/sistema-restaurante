import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler, noEncontrado } from './middlewares/errorHandler';
import { authRouter } from './modules/auth/auth.routes';

export const app = express();

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/auth', authRouter);

app.use(noEncontrado);
app.use(errorHandler);
