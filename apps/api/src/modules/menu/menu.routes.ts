import { Router } from 'express';
import { z } from 'zod';
import {
  actualizarCategoriaSchema,
  actualizarGrupoSchema,
  actualizarModificadorSchema,
  actualizarPlatoSchema,
  agotadoSchema,
  categoriaSchema,
  estacionSchema,
  grupoParamSchema,
  grupoSchema,
  guardarGruposSchema,
  idParamSchema,
  modificadorParamSchema,
  modificadorSchema,
  ordenSchema,
  platoParamSchema,
  platoSchema,
} from '@menu-qr/shared';
import { autenticar } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/roles';
import { tenant } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import {
  categoriasCtrl,
  estacionesCtrl,
  modificadoresCtrl as m,
  platosCtrl,
} from './menu.controller';

const dueno = requireRole('DUENO');
const conId = validate({ params: idParamSchema });

// /estaciones
export const estacionesRouter = Router();
estacionesRouter.use(autenticar, dueno, tenant);
estacionesRouter.get('/', estacionesCtrl.listar);
estacionesRouter.post('/', validate({ body: estacionSchema }), estacionesCtrl.crear);
estacionesRouter.get('/:id', conId, estacionesCtrl.obtener);
estacionesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: estacionSchema }),
  estacionesCtrl.actualizar,
);
estacionesRouter.delete('/:id', conId, estacionesCtrl.eliminar);

// /categorias
export const categoriasRouter = Router();
categoriasRouter.use(autenticar, dueno, tenant);
categoriasRouter.get('/', categoriasCtrl.listar);
categoriasRouter.post('/', validate({ body: categoriaSchema }), categoriasCtrl.crear);
// Antes de '/:id' para que "orden" no se tome como id.
categoriasRouter.patch('/orden', validate({ body: ordenSchema }), categoriasCtrl.ordenar);
categoriasRouter.get('/:id', conId, categoriasCtrl.obtener);
categoriasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: actualizarCategoriaSchema }),
  categoriasCtrl.actualizar,
);
categoriasRouter.delete('/:id', conId, categoriasCtrl.eliminar);

// /platos — el personal de sala y cocina puede verlos y marcarlos agotados.
const personalMenu = requireRole('DUENO', 'MESERO', 'COCINA');
export const platosRouter = Router();
platosRouter.use(autenticar, tenant);
platosRouter.get(
  '/',
  personalMenu,
  validate({ query: z.object({ categoriaId: z.uuid().optional() }) }),
  platosCtrl.listar,
);
platosRouter.post('/', dueno, validate({ body: platoSchema }), platosCtrl.crear);
// Antes de '/:id' para que "orden" no se tome como id.
platosRouter.patch('/orden', dueno, validate({ body: ordenSchema }), platosCtrl.ordenar);
platosRouter.get('/:id', personalMenu, conId, platosCtrl.obtener);
platosRouter.patch(
  '/:id',
  dueno,
  validate({ params: idParamSchema, body: actualizarPlatoSchema }),
  platosCtrl.actualizar,
);
platosRouter.delete('/:id', dueno, conId, platosCtrl.eliminar);
platosRouter.post('/:id/duplicar', dueno, conId, platosCtrl.duplicar);
platosRouter.patch(
  '/:id/agotado',
  personalMenu,
  validate({ params: idParamSchema, body: agotadoSchema }),
  platosCtrl.agotado,
);

// /platos/:platoId/grupos-modificadores[/:grupoId[/modificadores[/:modificadorId]]]
const g = '/:platoId/grupos-modificadores';
platosRouter.get(g, dueno, validate({ params: platoParamSchema }), m.listarGrupos);
platosRouter.put(
  g,
  dueno,
  validate({ params: platoParamSchema, body: guardarGruposSchema }),
  platosCtrl.guardarGrupos,
);
platosRouter.post(
  g,
  dueno,
  validate({ params: platoParamSchema, body: grupoSchema }),
  m.crearGrupo,
);
platosRouter.patch(
  `${g}/:grupoId`,
  dueno,
  validate({ params: grupoParamSchema, body: actualizarGrupoSchema }),
  m.actualizarGrupo,
);
platosRouter.delete(
  `${g}/:grupoId`,
  dueno,
  validate({ params: grupoParamSchema }),
  m.eliminarGrupo,
);
platosRouter.post(
  `${g}/:grupoId/modificadores`,
  dueno,
  validate({ params: grupoParamSchema, body: modificadorSchema }),
  m.crearModificador,
);
platosRouter.patch(
  `${g}/:grupoId/modificadores/:modificadorId`,
  dueno,
  validate({ params: modificadorParamSchema, body: actualizarModificadorSchema }),
  m.actualizarModificador,
);
platosRouter.delete(
  `${g}/:grupoId/modificadores/:modificadorId`,
  dueno,
  validate({ params: modificadorParamSchema }),
  m.eliminarModificador,
);
