import type { Request, Response } from 'express';
import type { EstadoSuscripcion } from '@menu-qr/shared';
import * as restaurantes from '../restaurantes/restaurantes.service';
import * as service from './admin.service';

type ConId = Request<{ id: string }>;

export const resumen = async (_req: Request, res: Response) => {
  res.json(await service.resumen());
};
export const listar = async (req: Request, res: Response) => {
  const { buscar, estado } = req.query as { buscar?: string; estado?: EstadoSuscripcion };
  res.json(await service.listar({ buscar, estado }));
};
export const crear = async (req: Request, res: Response) => {
  res.status(201).json(await restaurantes.crear(req.body));
};
export const detalle = async (req: ConId, res: Response) => {
  res.json(await service.detalle(req.params.id));
};
export const actualizar = async (req: ConId, res: Response) => {
  await restaurantes.actualizarAdmin(req.params.id, req.body);
  res.json(await service.detalle(req.params.id));
};
export const registrarPago = async (req: ConId, res: Response) => {
  res.status(201).json(await service.registrarPago(req.params.id, req.usuario!.id, req.body));
};
export const restablecerDueno = async (req: ConId, res: Response) => {
  res.json(await service.restablecerDueno(req.params.id));
};
