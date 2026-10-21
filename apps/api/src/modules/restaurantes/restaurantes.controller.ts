import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as service from './restaurantes.service';

export const crear = async (req: Request, res: Response) => {
  res.status(201).json(await service.crear(req.body));
};

export const listar = async (_req: Request, res: Response) => {
  res.json(await service.listar());
};

export const actualizarAdmin = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await service.actualizarAdmin(req.params.id, req.body));
};

export const obtenerPropio = async (req: Request, res: Response) => {
  res.json(await service.obtenerPropio(restauranteDe(req)));
};

export const actualizarPropio = async (req: Request, res: Response) => {
  res.json(await service.actualizarPropio(restauranteDe(req), req.body));
};
