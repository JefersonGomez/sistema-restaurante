import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import * as service from './enlinea.service';

type ConId = Request<{ id: string }>;

// Cliente (público)
export const crear = async (req: Request<{ slug: string }>, res: Response) => {
  res.status(201).json(await service.crear(req.params.slug, req.body));
};
export const seguimiento = async (req: Request<{ token: string }>, res: Response) => {
  res.json(await service.seguimiento(req.params.token));
};

// Restaurante
export const listar = async (req: Request, res: Response) => {
  res.json(await service.listar(restauranteDe(req)));
};
export const aceptar = async (req: ConId, res: Response) => {
  res.json(
    await service.aceptar(
      restauranteDe(req),
      req.usuario!.id,
      req.params.id,
      req.body.tiempoEstimadoMin,
    ),
  );
};
export const rechazar = async (req: ConId, res: Response) => {
  res.json(
    await service.rechazar(restauranteDe(req), req.usuario!.id, req.params.id, req.body.motivo),
  );
};
export const etapa = async (req: ConId, res: Response) => {
  res.json(await service.cambiarEtapa(restauranteDe(req), req.params.id, req.body.etapa));
};
export const pagoVerificado = async (req: ConId, res: Response) => {
  res.json(await service.verificarPago(restauranteDe(req), req.usuario!.id, req.params.id));
};
export const entregar = async (req: ConId, res: Response) => {
  res.json(
    await service.entregar(restauranteDe(req), req.usuario!.id, req.params.id, req.body.metodoPago),
  );
};

// Repartidores
export const repartidores = async (req: Request, res: Response) => {
  res.json(await service.repartidores(restauranteDe(req)));
};
export const asignarRepartidor = async (req: ConId, res: Response) => {
  res.json(
    await service.asignarRepartidor(restauranteDe(req), req.params.id, req.body.repartidorId),
  );
};
export const efectivo = async (req: Request, res: Response) => {
  res.json(await service.efectivoPorCuadrar(restauranteDe(req)));
};
export const recibirEfectivo = async (req: Request, res: Response) => {
  res.json(await service.recibirEfectivo(restauranteDe(req), req.body.repartidorId));
};

// El repartidor (sus propias entregas)
export const misRepartos = async (req: Request, res: Response) => {
  res.json(await service.misRepartos(restauranteDe(req), req.usuario!.id));
};
export const salir = async (req: ConId, res: Response) => {
  res.json(await service.salir(restauranteDe(req), req.usuario!.id, req.params.id));
};
export const entregarReparto = async (req: ConId, res: Response) => {
  res.json(
    await service.entregarReparto(
      restauranteDe(req),
      req.usuario!.id,
      req.params.id,
      req.body.metodoPago,
    ),
  );
};
