import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../lib/env';
import * as service from './auth.service';
import * as recuperacion from './recuperacion.service';

const COOKIE = 'refreshToken';
const opcionesCookie: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth',
  maxAge: env.JWT_REFRESH_TTL_DIAS * 24 * 60 * 60 * 1000,
};

export async function login(req: Request, res: Response) {
  const { refreshToken, accessToken, usuario } = await service.login(req.body);
  res.cookie(COOKIE, refreshToken, opcionesCookie).json({ accessToken, usuario });
}

export async function registro(req: Request, res: Response) {
  const { refreshToken, accessToken, usuario } = await service.registrar(req.body);
  res.status(201).cookie(COOKIE, refreshToken, opcionesCookie).json({ accessToken, usuario });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken, accessToken } = await service.refrescar(req.cookies?.[COOKIE]);
  res.cookie(COOKIE, refreshToken, opcionesCookie).json({ accessToken });
}

export async function logout(req: Request, res: Response) {
  await service.logout(req.cookies?.[COOKIE]);
  res
    .clearCookie(COOKIE, { ...opcionesCookie, maxAge: undefined })
    .status(204)
    .end();
}

export async function cambiarPassword(req: Request, res: Response) {
  await service.cambiarPassword(req.usuario!.id, req.body.actual, req.body.nueva);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ usuario: await service.yo(req.usuario!.id) });
}

// Siempre 204, exista o no el correo.
export const olvide = async (req: Request, res: Response) => {
  await recuperacion.olvidePersonal(req.body.email);
  res.status(204).end();
};
export const restablecer = async (req: Request, res: Response) => {
  await recuperacion.restablecerPersonal(req.body.token, req.body.password);
  res.status(204).end();
};
