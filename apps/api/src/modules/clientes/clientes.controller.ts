import type { Request, RequestHandler, Response } from 'express';
import { HttpError } from '../../middlewares/errorHandler';
import { restauranteDe } from '../../middlewares/tenant';
import * as service from './clientes.service';

type ConSlug = Request<{ slug: string }>;

// Cuenta del cliente: el token va en el encabezado `X-Cliente` y solo vale en su restaurante.
export const autenticarRegistrado: RequestHandler<{ slug: string }> = async (req, _res, next) => {
  const s = await service.sesionDe(req.params.slug, req.get('x-cliente'));
  if (!s) throw new HttpError(401, 'NO_AUTENTICADO', 'Entre a su cuenta de nuevo');
  req.registrado = s;
  next();
};
const registradoDe = (req: Request) => req.registrado!;

export const registrar = async (req: ConSlug, res: Response) => {
  res.status(201).json(await service.registrar(req.params.slug, req.body));
};
export const entrar = async (req: ConSlug, res: Response) => {
  res.json(await service.entrar(req.params.slug, req.body.email, req.body.password));
};
export const perfil = async (req: ConSlug, res: Response) => {
  res.json(await service.perfil(registradoDe(req).clienteId));
};
export const actualizarPerfil = async (req: ConSlug, res: Response) => {
  res.json(await service.actualizarPerfil(registradoDe(req).clienteId, req.body));
};
export const cambiarPassword = async (req: ConSlug, res: Response) => {
  const { clienteId, sesionId } = registradoDe(req);
  await service.cambiarPassword(clienteId, sesionId, req.body.actual, req.body.nueva);
  res.status(204).end();
};
export const salir = async (req: ConSlug, res: Response) => {
  await service.salir(registradoDe(req).sesionId);
  res.status(204).end();
};

// Restaurante
export const listar = async (req: Request, res: Response) => {
  res.json(await service.listar(restauranteDe(req), req.query.buscar as string | undefined));
};
export const canjear = async (req: Request, res: Response) => {
  res.json(await service.canjear(restauranteDe(req), req.usuario!.id, req.body.telefono));
};
