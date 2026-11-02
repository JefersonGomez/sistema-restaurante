import { Router } from 'express';
import {
  aceptarEnLineaSchema,
  asignarRepartidorSchema,
  entregarEnLineaSchema,
  etapaEnLineaCambioSchema,
  idParamSchema,
  motivoSchema,
  recibirEfectivoSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import * as c from './enlinea.controller';

// /enlinea — pedidos para recoger y a domicilio (dueño, caja y mesero)
export const enLineaRouter = Router();
enLineaRouter.use(autenticar, requireRole('DUENO', 'CAJA', 'MESERO'), tenant);
const conId = validate({ params: idParamSchema });
enLineaRouter.get('/', c.listar);
enLineaRouter.post(
  '/:id/aceptar',
  validate({ params: idParamSchema, body: aceptarEnLineaSchema }),
  c.aceptar,
);
enLineaRouter.post(
  '/:id/rechazar',
  validate({ params: idParamSchema, body: motivoSchema }),
  c.rechazar,
);
enLineaRouter.post(
  '/:id/etapa',
  validate({ params: idParamSchema, body: etapaEnLineaCambioSchema }),
  c.etapa,
);
enLineaRouter.post('/:id/pago-verificado', conId, c.pagoVerificado);
enLineaRouter.post(
  '/:id/entregar',
  validate({ params: idParamSchema, body: entregarEnLineaSchema }),
  c.entregar,
);
enLineaRouter.get('/repartidores', c.repartidores);
enLineaRouter.post(
  '/:id/repartidor',
  validate({ params: idParamSchema, body: asignarRepartidorSchema }),
  c.asignarRepartidor,
);
// Efectivo que traen los repartidores: solo caja y dueño.
const caja = requireRole('DUENO', 'CAJA');
enLineaRouter.get('/efectivo', caja, c.efectivo);
enLineaRouter.post(
  '/efectivo/recibir',
  caja,
  validate({ body: recibirEfectivoSchema }),
  c.recibirEfectivo,
);

// /repartos — el repartidor ve y mueve solo sus entregas
export const repartosRouter = Router();
repartosRouter.use(autenticar, requireRole('REPARTIDOR'), tenant);
repartosRouter.get('/', c.misRepartos);
repartosRouter.post('/:id/salir', conId, c.salir);
repartosRouter.post(
  '/:id/entregar',
  validate({ params: idParamSchema, body: entregarEnLineaSchema }),
  c.entregarReparto,
);
