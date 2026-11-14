import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as s from './caja.service';

export const actual = async (req: Request, res: Response) => {
  res.json(await s.turnoActual(restauranteDe(req)));
};
export const abrir = async (req: Request, res: Response) => {
  res.status(201).json(await s.abrir(restauranteDe(req), req.usuario!.id, req.body.fondoInicial));
};
export const movimiento = async (req: Request, res: Response) => {
  res.status(201).json(await s.movimiento(restauranteDe(req), req.usuario!.id, req.body));
};
export const cerrar = async (req: Request, res: Response) => {
  res.json(await s.cerrar(restauranteDe(req), req.usuario!.id, req.body));
};
export const cierres = async (req: Request, res: Response) => {
  res.json(await s.cierres(restauranteDe(req)));
};
export const obtener = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await s.obtener(restauranteDe(req), req.params.id));
};
