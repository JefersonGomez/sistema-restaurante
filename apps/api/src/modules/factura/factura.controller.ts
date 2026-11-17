import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as s from './comprobantes.service';

export const listar = async (req: Request, res: Response) => {
  res.json(await s.listar(restauranteDe(req)));
};
export const reintentar = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await s.reintentar(restauranteDe(req), req.params.id));
};
export const anular = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await s.anular(restauranteDe(req), req.params.id, req.body));
};
export const enviar = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await s.enviarPorCorreo(restauranteDe(req), req.params.id, req.body.correo));
};
export const descargar = async (
  req: Request<{ id: string; tipo: 'pdf' | 'xml' }>,
  res: Response,
) => {
  const a = await s.archivo(restauranteDe(req), req.params.id, req.params.tipo);
  res
    .type(req.params.tipo === 'pdf' ? 'application/pdf' : 'application/xml')
    .attachment(a.nombre)
    .send(a.contenido);
};
export const lineas = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await s.lineasAcreditables(restauranteDe(req), req.params.id));
};
export const notaParcial = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await s.notaParcial(restauranteDe(req), req.params.id, req.body));
};
export const contribuyente = async (req: Request, res: Response) => {
  res.json(await s.contribuyente((req.query as { id: string }).id));
};
export const obtenerConfig = async (req: Request, res: Response) => {
  res.json(await s.obtenerConfig(restauranteDe(req)));
};
export const guardarConfig = async (req: Request, res: Response) => {
  res.json(await s.guardarConfig(restauranteDe(req), req.body));
};
export const probar = async (req: Request, res: Response) => {
  res.json(await s.probarConexion(restauranteDe(req)));
};
