import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { restauranteDe, tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as service from './uploads.service';

// En memoria: la imagen se procesa y se guarda ya convertida.
const recibir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: service.TAMANO_MAXIMO, files: 1 },
}).single('imagen');

const subir = async (req: Request, res: Response) => {
  const { destino } = req.query as { destino: 'plato' | 'logo' | 'banner' };
  res.status(201).json(await service.subirImagen(restauranteDe(req), req.file?.buffer, destino));
};

const borrar = async (req: Request, res: Response) => {
  await service.borrarImagen(restauranteDe(req), req.body.url);
  res.status(204).end();
};

// /uploads (DUENO)
export const uploadsRouter = Router();
uploadsRouter.use(autenticar, requireRole('DUENO'), tenant);
uploadsRouter.post(
  '/imagen',
  validate({ query: z.object({ destino: z.enum(['plato', 'logo', 'banner']).default('plato') }) }),
  recibir,
  subir,
);
uploadsRouter.delete('/imagen', validate({ body: z.object({ url: z.url() }) }), borrar);
