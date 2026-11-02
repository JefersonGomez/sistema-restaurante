import { env } from '../../lib/env';
import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as service from './restaurantes.service';

export const obtenerPropio = async (req: Request, res: Response) => {
  const r = await service.obtenerPropio(restauranteDe(req));
  // Enlace para pedir en línea (el panel no conoce la URL pública del menú).
  res.json({ ...r, enlaceEnLinea: `${env.MENU_PUBLIC_URL}/r/${r.slug}` });
};

export const suscripcion = async (req: Request, res: Response) => {
  res.json(await service.suscripcion(restauranteDe(req)));
};

export const guardarHorarios = async (req: Request, res: Response) => {
  res.json(await service.guardarHorarios(restauranteDe(req), req.body));
};

export const actualizarPropio = async (req: Request, res: Response) => {
  res.json(await service.actualizarPropio(restauranteDe(req), req.body));
};

export const qrEnLinea = async (req: Request, res: Response) => {
  const { png } = await service.qrEnLinea(restauranteDe(req));
  res.type('image/png').attachment('qr-pedidos-en-linea.png').send(png);
};
