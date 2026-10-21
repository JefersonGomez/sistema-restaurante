import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../lib/env';
import * as service from './auth.service';

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

export async function me(req: Request, res: Response) {
  res.json({ usuario: await service.yo(req.usuario!.id) });
}
