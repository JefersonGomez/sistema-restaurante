import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, limpiarBD, tokenDe } from './helpers';

// OBLIGATORIO: el dueño de A no puede leer ni modificar datos de B.

type Datos = { categoriaId: string; estacionId: string; platoId: string; mesaId: string };
let tokenA: string;
let b: Datos;
let a: Datos;

async function sembrar(restauranteId: string): Promise<Datos> {
  const estacion = await prisma.estacion.create({ data: { restauranteId, nombre: 'Cocina' } });
  const categoria = await prisma.categoria.create({
    data: { restauranteId, nombreEs: 'Platos', nombreEn: 'Dishes' },
  });
  const plato = await prisma.plato.create({
    data: {
      restauranteId,
      categoriaId: categoria.id,
      estacionId: estacion.id,
      nombreEs: 'Casado',
      nombreEn: 'Casado',
      precio: 450000,
    },
  });
  await prisma.grupoModificadores.create({
    data: { restauranteId, platoId: plato.id, nombreEs: 'Término', nombreEn: 'Doneness' },
  });
  const mesa = await prisma.mesa.create({
    data: { restauranteId, numero: 1, tokenQr: `t-${restauranteId}` },
  });
  return { categoriaId: categoria.id, estacionId: estacion.id, platoId: plato.id, mesaId: mesa.id };
}

const conA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);

beforeAll(async () => {
  await limpiarBD();
  const ra = await crearRestaurante('resto-a');
  const rb = await crearRestaurante('resto-b');
  a = await sembrar(ra.restaurante.id);
  b = await sembrar(rb.restaurante.id);
  tokenA = await tokenDe('dueno@resto-a.test');
});

describe('aislamiento entre restaurantes', () => {
  it('los listados solo traen datos propios', async () => {
    for (const ruta of ['/platos', '/categorias', '/mesas', '/estaciones']) {
      const res = await conA(request(app).get(ruta));
      expect(res.status).toBe(200);
      const ids = res.body.map((x: { id: string }) => x.id);
      expect(ids).toHaveLength(1);
      for (const id of ids) expect(Object.values(b)).not.toContain(id);
    }
  });

  it('no puede LEER platos, categorías ni mesas de B (404)', async () => {
    const rutas = [
      `/platos/${b.platoId}`,
      `/categorias/${b.categoriaId}`,
      `/mesas/${b.mesaId}`,
      `/estaciones/${b.estacionId}`,
      `/mesas/${b.mesaId}/qr`,
      `/platos/${b.platoId}/grupos-modificadores`,
    ];
    for (const ruta of rutas) expect((await conA(request(app).get(ruta))).status, ruta).toBe(404);
  });

  it('no puede MODIFICAR platos, categorías ni mesas de B (404) y B queda intacto', async () => {
    const cambios: [string, object][] = [
      [`/platos/${b.platoId}`, { nombreEs: 'Hackeado' }],
      [`/platos/${b.platoId}/agotado`, { agotado: true }],
      [`/categorias/${b.categoriaId}`, { nombreEs: 'Hackeado' }],
      [`/mesas/${b.mesaId}`, { nombre: 'Hackeado' }],
      [`/estaciones/${b.estacionId}`, { nombre: 'Hackeado' }],
    ];
    for (const [ruta, body] of cambios)
      expect((await conA(request(app).patch(ruta)).send(body)).status, ruta).toBe(404);

    expect((await conA(request(app).post(`/mesas/${b.mesaId}/regenerar-token`))).status).toBe(404);
    expect(
      (
        await conA(request(app).post(`/platos/${b.platoId}/grupos-modificadores`)).send({
          nombreEs: 'x',
          nombreEn: 'x',
        })
      ).status,
    ).toBe(404);

    const plato = await prisma.plato.findUniqueOrThrow({ where: { id: b.platoId } });
    expect(plato).toMatchObject({ nombreEs: 'Casado', agotado: false });
    const mesa = await prisma.mesa.findUniqueOrThrow({ where: { id: b.mesaId } });
    expect(mesa.nombre).toBeNull();
  });

  it('no puede BORRAR datos de B (404)', async () => {
    for (const ruta of [
      `/platos/${b.platoId}`,
      `/categorias/${b.categoriaId}`,
      `/mesas/${b.mesaId}`,
      `/estaciones/${b.estacionId}`,
    ])
      expect((await conA(request(app).delete(ruta))).status, ruta).toBe(404);
    expect(await prisma.plato.count({ where: { id: b.platoId } })).toBe(1);
  });

  it('no puede crear un plato propio apuntando a la categoría o estación de B', async () => {
    const base = { nombreEs: 'x', nombreEn: 'x', precio: 100 };
    const conCategoriaB = await conA(request(app).post('/platos')).send({
      ...base,
      categoriaId: b.categoriaId,
      estacionId: a.estacionId,
    });
    expect(conCategoriaB.status).toBe(404);
    const conEstacionB = await conA(request(app).post('/platos')).send({
      ...base,
      categoriaId: a.categoriaId,
      estacionId: b.estacionId,
    });
    expect(conEstacionB.status).toBe(404);
  });

  it('no puede reordenar categorías de B', async () => {
    const res = await conA(request(app).patch('/categorias/orden')).send({
      ids: [a.categoriaId, b.categoriaId],
    });
    expect(res.status).toBe(400);
  });

  it('ignora un restauranteId inyectado en el body', async () => {
    const res = await conA(request(app).post('/mesas')).send({
      numero: 50,
      restauranteId: (await prisma.restaurante.findUniqueOrThrow({ where: { slug: 'resto-b' } }))
        .id,
    });
    expect(res.status).toBe(201);
    const mesa = await prisma.mesa.findUniqueOrThrow({ where: { id: res.body.id } });
    const ra = await prisma.restaurante.findUniqueOrThrow({ where: { slug: 'resto-a' } });
    expect(mesa.restauranteId).toBe(ra.id);
  });
});
