import type { Request, Response } from 'express';
import { COOKIE, opcionesCookie } from '../auth/auth.controller';
import * as service from './demo.service';

type Sesion = Awaited<ReturnType<typeof service.crear>>;
const responder = (res: Response, { refreshToken, accessToken, usuario }: Sesion, estado = 200) =>
  res.status(estado).cookie(COOKIE, refreshToken, opcionesCookie).json({ accessToken, usuario });

export async function crear(req: Request, res: Response) {
  responder(res, await service.crear(req.body.rol), 201);
}

export async function cambiarRol(req: Request, res: Response) {
  responder(res, await service.cambiarRol(req.usuario!.restauranteId, req.body.rol));
}

export async function info(req: Request, res: Response) {
  res.json(await service.info(req.usuario!.restauranteId));
}
