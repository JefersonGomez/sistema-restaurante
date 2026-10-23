import type { Request, Response } from 'express';
import type { EstadoItem, EstadoPedido } from '@menu-qr/shared';
import { restauranteDe } from '../../middlewares/tenant';
import * as s from './operacion.service';

type ConId = Request<{ id: string }>;

export const mesas = async (req: Request, res: Response) => {
  res.json(await s.mesas(restauranteDe(req)));
};

export const detalleCuenta = async (req: ConId, res: Response) => {
  res.json(await s.detalleCuenta(restauranteDe(req), req.params.id));
};

export const pedidos = async (req: Request, res: Response) => {
  const { estado } = req.query as { estado?: EstadoPedido };
  res.json(await s.pedidos(restauranteDe(req), estado));
};

export const confirmar = async (req: ConId, res: Response) => {
  res.json(await s.confirmarPedido(restauranteDe(req), req.usuario!.id, req.params.id));
};

export const cancelarPedido = async (req: ConId, res: Response) => {
  res.json(await s.cancelarPedido(restauranteDe(req), req.params.id, req.body.motivo));
};

export const pedidoDeMesero = async (req: ConId, res: Response) => {
  const { pedido, creado } = await s.pedidoDeMesero(
    restauranteDe(req),
    req.usuario!.id,
    req.params.id,
    req.body,
  );
  res.status(creado ? 201 : 200).json(pedido);
};

export const estaciones = async (req: Request, res: Response) => {
  res.json(await s.estacionesVisibles(restauranteDe(req), req.usuario!));
};

export const itemsEstacion = async (req: ConId, res: Response) => {
  res.json(await s.itemsEstacion(restauranteDe(req), req.usuario!, req.params.id));
};

export const items = async (req: Request, res: Response) => {
  const { estado } = req.query as { estado?: EstadoItem };
  res.json(await s.items(restauranteDe(req), estado));
};

export const estadoItem = async (req: ConId, res: Response) => {
  res.json(
    await s.cambiarEstadoItem(restauranteDe(req), req.usuario!, req.params.id, req.body.estado),
  );
};

// Deshace el último avance (el body dice de qué estado se vuelve).
export const deshacerItem = async (req: ConId, res: Response) => {
  res.json(
    await s.cambiarEstadoItem(
      restauranteDe(req),
      req.usuario!,
      req.params.id,
      req.body.estado,
      true,
    ),
  );
};

export const cancelarItem = async (req: ConId, res: Response) => {
  res.json(await s.cancelarItem(restauranteDe(req), req.params.id, req.body.motivo));
};

export const llamadas = async (req: Request, res: Response) => {
  const { atendida } = req.query as { atendida?: boolean };
  res.json(await s.llamadas(restauranteDe(req), atendida));
};

export const atender = async (req: ConId, res: Response) => {
  res.json(await s.atenderLlamada(restauranteDe(req), req.params.id));
};

export const cerrar = async (req: ConId, res: Response) => {
  res.json(
    await s.cerrarCuenta(restauranteDe(req), req.usuario!.id, req.params.id, req.body.metodoPago),
  );
};

type ConPago = Request<{ id: string; pagoId: string }>;

// Cuenta separada: cobra un grupo; deshacer un grupo cobrado por error.
export const cobrarParte = async (req: ConId, res: Response) => {
  res.json(await s.cobrarParte(restauranteDe(req), req.usuario!.id, req.params.id, req.body));
};

export const deshacerPago = async (req: ConPago, res: Response) => {
  res.json(await s.deshacerPago(restauranteDe(req), req.params.id, req.params.pagoId));
};
