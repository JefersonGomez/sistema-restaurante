import type { Request, RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { hashToken } from '../lib/tokens';
import { cuentaCerrada } from '../modules/pedidos/pedidos.service';
import { HttpError } from './errorHandler';

// Rutas del comensal: exige el token de sesión de cliente en `Authorization: Bearer`.
// La cuenta sale SOLO de la sesión; nunca de body, query o params.
export const autenticarCliente: RequestHandler = async (req, _res, next) => {
  const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
  if (tipo !== 'Bearer' || !token) throw new HttpError(401, 'NO_AUTENTICADO', 'Falta la sesión');

  const sesion = await prisma.sesionCliente.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { cuenta: { select: { estado: true, restauranteId: true, mesaId: true } } },
  });
  if (!sesion) throw new HttpError(401, 'SESION_INVALIDA', 'Sesión inválida');
  if (sesion.revocada || sesion.cuenta.estado === 'CERRADA') throw cuentaCerrada();
  if (sesion.expiraEn < new Date())
    throw new HttpError(401, 'SESION_EXPIRADA', 'La sesión expiró, escanee el QR de nuevo');

  req.cliente = {
    sesionId: sesion.id,
    cuentaId: sesion.cuentaId,
    restauranteId: sesion.cuenta.restauranteId,
    mesaId: sesion.cuenta.mesaId!, // las sesiones de comensal solo existen en cuentas de mesa
  };
  next();
};

export const clienteDe = (req: Request) => req.cliente!;
