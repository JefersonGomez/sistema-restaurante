import type { Request, Response } from 'express';
import { restauranteDe } from '../../middlewares/tenant';
import { buscarCabys } from './cabys.service';
import * as categorias from './categorias.service';
import * as estaciones from './estaciones.service';
import * as mods from './modificadores.service';
import * as platos from './platos.service';

type ConId = Request<{ id: string }>;
type ConPlato = Request<{ platoId: string; grupoId: string; modificadorId: string }>;

const ref = (req: ConPlato) => ({ restauranteId: restauranteDe(req), platoId: req.params.platoId });

// CRUD genérico para servicios con la forma (restauranteId, id?, data?).
function crud(s: {
  listar: (rid: string) => Promise<unknown>;
  obtener: (rid: string, id: string) => Promise<unknown>;
  crear: (rid: string, data: never) => Promise<unknown>;
  actualizar: (rid: string, id: string, data: never) => Promise<unknown>;
  eliminar: (rid: string, id: string) => Promise<void>;
}) {
  return {
    listar: async (req: Request, res: Response) => {
      res.json(await s.listar(restauranteDe(req)));
    },
    obtener: async (req: ConId, res: Response) => {
      res.json(await s.obtener(restauranteDe(req), req.params.id));
    },
    crear: async (req: Request, res: Response) => {
      res.status(201).json(await s.crear(restauranteDe(req), req.body as never));
    },
    actualizar: async (req: ConId, res: Response) => {
      res.json(await s.actualizar(restauranteDe(req), req.params.id, req.body as never));
    },
    eliminar: async (req: ConId, res: Response) => {
      await s.eliminar(restauranteDe(req), req.params.id);
      res.status(204).end();
    },
  };
}

export const estacionesCtrl = crud(estaciones);

export const categoriasCtrl = {
  ...crud(categorias),
  ordenar: async (req: Request, res: Response) => {
    res.json(await categorias.ordenar(restauranteDe(req), req.body));
  },
};

export const platosCtrl = {
  ...crud(platos),
  listar: async (req: Request, res: Response) => {
    const categoriaId = (req.query as { categoriaId?: string }).categoriaId;
    res.json(await platos.listar(restauranteDe(req), categoriaId));
  },
  ordenar: async (req: Request, res: Response) => {
    res.json(await platos.ordenar(restauranteDe(req), req.body));
  },
  cabys: async (req: Request, res: Response) => {
    res.json(await buscarCabys((req.query as { q: string }).q));
  },
  duplicar: async (req: ConId, res: Response) => {
    res.status(201).json(await platos.duplicar(restauranteDe(req), req.params.id));
  },
  guardarGrupos: async (req: ConPlato, res: Response) => {
    res.json(await platos.guardarGrupos(restauranteDe(req), req.params.platoId, req.body));
  },
  agotado: async (req: ConId, res: Response) => {
    res.json(await platos.marcarAgotado(restauranteDe(req), req.params.id, req.body.agotado));
  },
};

export const modificadoresCtrl = {
  listarGrupos: async (req: ConPlato, res: Response) => {
    res.json(await mods.listarGrupos(ref(req)));
  },
  crearGrupo: async (req: ConPlato, res: Response) => {
    res.status(201).json(await mods.crearGrupo(ref(req), req.body));
  },
  actualizarGrupo: async (req: ConPlato, res: Response) => {
    res.json(await mods.actualizarGrupo(ref(req), req.params.grupoId, req.body));
  },
  eliminarGrupo: async (req: ConPlato, res: Response) => {
    await mods.eliminarGrupo(ref(req), req.params.grupoId);
    res.status(204).end();
  },
  crearModificador: async (req: ConPlato, res: Response) => {
    res.status(201).json(await mods.crearModificador(ref(req), req.params.grupoId, req.body));
  },
  actualizarModificador: async (req: ConPlato, res: Response) => {
    const { grupoId, modificadorId } = req.params;
    res.json(await mods.actualizarModificador(ref(req), grupoId, modificadorId, req.body));
  },
  eliminarModificador: async (req: ConPlato, res: Response) => {
    await mods.eliminarModificador(ref(req), req.params.grupoId, req.params.modificadorId);
    res.status(204).end();
  },
};
