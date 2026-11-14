import { Router } from 'express';
import {
  avanzarPedidoSchema,
  cambiarEstadoItemSchema,
  cerrarCuentaSchema,
  cobrarParteSchema,
  crearPedidoSchema,
  idParamSchema,
  itemsQuerySchema,
  llamadasQuerySchema,
  motivoSchema,
  pagoParamSchema,
  pedidosQuerySchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './operacion.controller';

const sala = requireRole('DUENO', 'MESERO');
const salaYCaja = requireRole('DUENO', 'MESERO', 'CAJA');
const cocina = requireRole('DUENO', 'COCINA');
const caja = requireRole('DUENO', 'CAJA');
const conId = validate({ params: idParamSchema });

// /operacion — personal del restaurante
export const operacionRouter = Router();
operacionRouter.use(autenticar, tenant);

operacionRouter.get('/mesas', salaYCaja, c.mesas);
operacionRouter.post(
  '/mesas/:id/pedidos',
  sala,
  validate({ params: idParamSchema, body: crearPedidoSchema }),
  c.pedidoDeMesero,
);

operacionRouter.get('/cuentas/:id', salaYCaja, conId, c.detalleCuenta);
operacionRouter.post(
  '/cuentas/:id/pagos',
  caja,
  validate({ params: idParamSchema, body: cobrarParteSchema }),
  c.cobrarParte,
);
operacionRouter.delete(
  '/cuentas/:id/pagos/:pagoId',
  caja,
  validate({ params: pagoParamSchema }),
  c.deshacerPago,
);
operacionRouter.post(
  '/cuentas/:id/cerrar',
  caja,
  validate({ params: idParamSchema, body: cerrarCuentaSchema }),
  c.cerrar,
);

operacionRouter.get('/pedidos', sala, validate({ query: pedidosQuerySchema }), c.pedidos);
operacionRouter.patch('/pedidos/:id/confirmar', sala, conId, c.confirmar);
operacionRouter.patch(
  '/pedidos/:id/cancelar',
  sala,
  validate({ params: idParamSchema, body: motivoSchema }),
  c.cancelarPedido,
);

operacionRouter.get('/estaciones', cocina, c.estaciones);
operacionRouter.get('/estaciones/:id/items', cocina, conId, c.itemsEstacion);

operacionRouter.post(
  '/pedidos/:id/avanzar',
  requireRole('DUENO', 'COCINA', 'MESERO'),
  validate({ params: idParamSchema, body: avanzarPedidoSchema }),
  c.avanzarPedido,
);

operacionRouter.post('/pedidos/:id/avisar-listo', cocina, conId, c.avisarListo);

operacionRouter.get('/items', sala, validate({ query: itemsQuerySchema }), c.items);
// Cocina: EN_PREPARACION/LISTO/ENTREGADO de su estación. Mesero: ENTREGADO. (El service valida el rol.)
operacionRouter.patch(
  '/items/:id/estado',
  requireRole('DUENO', 'COCINA', 'MESERO'),
  validate({ params: idParamSchema, body: cambiarEstadoItemSchema }),
  c.estadoItem,
);
operacionRouter.post(
  '/items/:id/deshacer',
  requireRole('DUENO', 'COCINA', 'MESERO'),
  validate({ params: idParamSchema, body: cambiarEstadoItemSchema }),
  c.deshacerItem,
);
operacionRouter.patch(
  '/items/:id/cancelar',
  sala,
  validate({ params: idParamSchema, body: motivoSchema }),
  c.cancelarItem,
);

operacionRouter.get('/llamadas', salaYCaja, validate({ query: llamadasQuerySchema }), c.llamadas);
operacionRouter.patch('/llamadas/:id/atender', sala, conId, c.atender);
