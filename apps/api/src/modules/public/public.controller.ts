import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { clienteDe } from '../../middlewares/cliente';
import * as comensal from './comensal.service';
import * as service from './public.service';
import { registrarVista } from '../reportes/reportes.service';

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

// Vista anónima del detalle de un plato (para "vistos vs. pedidos" en reportes).
export const vista = async (req: Request<{ id: string }>, res: Response) => {
  await registrarVista(clienteDe(req).restauranteId, req.params.id);
  res.status(204).end();
};

// --- Personas por mesa e ingreso con el cupo lleno ---
type ConToken = Request<{ token: string }>;
type ConTokenId = Request<{ token: string; id: string }>;

export const personas = async (req: Request, res: Response) => {
  res.json(await comensal.fijarPersonas(clienteDe(req), req.body.personas));
};

export const solicitarIngreso = async (req: ConToken, res: Response) => {
  res.status(201).json(await comensal.solicitarIngreso(req.params.token));
};

export const estadoIngreso = async (req: ConTokenId, res: Response) => {
  res.json(await comensal.estadoIngreso(req.params.token, req.params.id, req.body.clave));
};

export const responderIngreso = async (req: Request<{ id: string }>, res: Response) => {
  res.json(await comensal.responderIngreso(clienteDe(req), req.params.id, req.body.aceptar));
};

export const desbloquearIngreso = async (req: Request, res: Response) => {
  res.json(await comensal.desbloquearIngreso(clienteDe(req)));
};
