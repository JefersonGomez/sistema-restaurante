import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as service from './dispositivos.service';

type ConId = Request<{ id: string }>;
const tokenTablet = (req: Request) => req.get('x-dispositivo');

export const listar = async (req: Request, res: Response) => {
  res.json(await service.listar(restauranteDe(req)));
};

export const crearCodigo = async (req: Request, res: Response) => {
  res.status(201).json(await service.crearCodigo(restauranteDe(req), req.body));
};

export const revocar = async (req: ConId, res: Response) => {
  await service.revocar(restauranteDe(req), req.params.id);
  res.status(204).end();
};

export const fijarPin = async (req: ConId, res: Response) => {
  await service.fijarPin(restauranteDe(req), req.params.id, req.body.pin);
  res.status(204).end();
};

export const vincular = async (req: Request, res: Response) => {
  res.status(201).json(await service.vincular(req.body.codigo));
};

export const yo = async (req: Request, res: Response) => {
  res.json(await service.yo(tokenTablet(req)));
};

export const entrar = async (req: Request, res: Response) => {
  res.json(await service.entrar(tokenTablet(req), req.body.usuarioId, req.body.pin));
};
