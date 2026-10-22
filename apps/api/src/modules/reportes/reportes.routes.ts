import { Router, type Request, type Response } from 'express';
import { reporteQuerySchema, type ReporteQuery } from '@menu-qr/shared';
import { validate } from '../../middlewares/validate';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { restauranteDe, tenant } from '../../middlewares/tenant';
import * as service from './reportes.service';

const hoy = async (req: Request, res: Response) => {
  res.json(await service.hoy(restauranteDe(req)));
};

const rango = async (req: Request, res: Response) => {
  res.json(await service.rango(restauranteDe(req), req.query as unknown as ReporteQuery));
};

// /reportes (DUENO)
export const reportesRouter = Router();
reportesRouter.use(autenticar, requireRole('DUENO'), tenant);
reportesRouter.get('/hoy', hoy);
reportesRouter.get('/', validate({ query: reporteQuerySchema }), rango);
