import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as service from './mesas.service';

type ConId = Request<{ id: string }>;

export const listar = async (req: Request, res: Response) => {
  res.json(await service.listar(restauranteDe(req)));
};

export const obtener = async (req: ConId, res: Response) => {
  res.json(await service.obtener(restauranteDe(req), req.params.id));
};

export const crear = async (req: Request, res: Response) => {
  res.status(201).json(await service.crear(restauranteDe(req), req.body));
};

export const actualizar = async (req: ConId, res: Response) => {
  res.json(await service.actualizar(restauranteDe(req), req.params.id, req.body));
};

export const eliminar = async (req: ConId, res: Response) => {
  await service.eliminar(restauranteDe(req), req.params.id);
  res.status(204).end();
};

export const regenerarToken = async (req: ConId, res: Response) => {
  res.json(await service.regenerarToken(restauranteDe(req), req.params.id));
};

export const qr = async (req: ConId, res: Response) => {
  const { formato } = req.query as { formato: 'png' | 'svg' };
  const { tipo, cuerpo } = await service.qr(restauranteDe(req), req.params.id, formato);
  res.type(tipo).send(cuerpo);
};
