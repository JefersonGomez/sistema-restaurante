import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import * as service from './public.service';

export const menu = async (req: Request<{ slug: string }>, res: Response) => {
  res.json(await service.menu(req.params.slug));
};

export const mesa = async (req: Request<{ token: string }>, res: Response) => {
  res.json(await service.mesa(req.params.token));
};

export const health = async (_req: Request, res: Response) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
};
