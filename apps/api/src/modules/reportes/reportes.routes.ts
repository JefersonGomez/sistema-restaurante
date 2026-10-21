import { Router, type Request, type Response } from 'express';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { restauranteDe, tenant } from '../../middlewares/tenant';
import * as service from './reportes.service';

const hoy = async (req: Request, res: Response) => {
  res.json(await service.hoy(restauranteDe(req)));
};

// /reportes (DUENO)
export const reportesRouter = Router();
reportesRouter.use(autenticar, requireRole('DUENO'), tenant);
reportesRouter.get('/hoy', hoy);
