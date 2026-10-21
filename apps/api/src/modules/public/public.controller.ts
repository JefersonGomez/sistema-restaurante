import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { clienteDe } from '../../middlewares/cliente';
import * as comensal from './comensal.service';
import * as service from './public.service';

export const menu = async (req: Request<{ slug: string }>, res: Response) => {
  res.json(await service.menu(req.params.slug));
};

// Si el celular manda su sesión actual (Authorization: Bearer) se reutiliza.
export const mesa = async (req: Request<{ token: string }>, res: Response) => {
  const [tipo, sesion] = req.headers.authorization?.split(' ') ?? [];
  res.json(await comensal.abrirSesion(req.params.token, tipo === 'Bearer' ? sesion : undefined));
};

export const verCuenta = async (req: Request, res: Response) => {
  res.json(await comensal.verCuenta(clienteDe(req)));
};

export const pedir = async (req: Request, res: Response) => {
  const { pedido, creado } = await comensal.pedir(clienteDe(req), req.body);
  res.status(creado ? 201 : 200).json(pedido);
};

export const llamar = async (req: Request, res: Response) => {
  res.status(201).json(await comensal.llamarMesero(clienteDe(req)));
};

export const solicitar = async (req: Request, res: Response) => {
  res.json(await comensal.solicitarCuenta(clienteDe(req)));
};

export const health = async (_req: Request, res: Response) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
};
