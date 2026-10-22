import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, limpiarBD, sembrarMenu, tokenDe } from './helpers';

let m: Awaited<ReturnType<typeof sembrarMenu>>;
let mb: Awaited<ReturnType<typeof sembrarMenu>>;
let restauranteId: string;
let token: string;
const como = () => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${token}`),
  patch: (u: string) => request(app).patch(u).set('Authorization', `Bearer ${token}`),
  put: (u: string) => request(app).put(u).set('Authorization', `Bearer ${token}`),
});

beforeEach(async () => {
  await limpiarBD();
  const a = await crearRestaurante('resto-a');
  const b = await crearRestaurante('resto-b');
  restauranteId = a.restaurante.id;
  m = await sembrarMenu(restauranteId);
  mb = await sembrarMenu(b.restaurante.id);
  token = await tokenDe('dueno@resto-a.test');
});

describe('ordenar categorías y platos', () => {
  it('el orden de los platos persiste', async () => {
    const ids = [m.refresco, m.inactivo, m.casado, m.agotado];
    const res = await como().patch('/platos/orden').send({ ids });
    expect(res.status).toBe(200);
    const guardados = await prisma.plato.findMany({
      where: { restauranteId },
      orderBy: { orden: 'asc' },
    });
    expect(guardados.map((p) => p.id)).toEqual(ids);
    // Y el menú público respeta ese orden.
    const menu = (await request(app).get('/public/resto-a/menu')).body;
    expect(menu.categorias[0].platos.map((p: { id: string }) => p.id)).toEqual([
      m.refresco,
      m.casado,
      m.agotado,
    ]);
  });

  it('el orden de las categorías persiste', async () => {
    const otra = await prisma.categoria.create({
      data: { restauranteId, nombreEs: 'Otra', nombreEn: 'Other' },
    });
    const primera = await prisma.categoria.findFirstOrThrow({
      where: { restauranteId, nombreEs: 'Todo' },
    });
    await como()
      .patch('/categorias/orden')
      .send({ ids: [otra.id, primera.id] });
    const lista = (await como().get('/categorias')).body.map((c: { id: string }) => c.id);
    expect(lista).toEqual([otra.id, primera.id]);
  });

  it('no se pueden ordenar platos de otro restaurante', async () => {
    const res = await como()
      .patch('/platos/orden')
      .send({ ids: [m.casado, mb.casado] });
    expect(res.status).toBe(400);
  });
});

describe('duplicar plato', () => {
  it('copia datos y modificadores, inactivo y sin foto', async () => {
    await prisma.plato.update({ where: { id: m.casado }, data: { fotoUrl: 'http://x/a.webp' } });
    const res = await como().post(`/platos/${m.casado}/duplicar`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombreEs: 'Casado (copia)',
      activo: false,
      fotoUrl: null,
      precio: 480000,
    });
    expect(res.body.grupos.map((g: { nombreEs: string }) => g.nombreEs)).toEqual([
      'Término',
      'Extras',
    ]);
    expect(res.body.grupos[1].modificadores).toHaveLength(3);
    expect(res.body.grupos[0].id).not.toBe(
      (await como().get(`/platos/${m.casado}`)).body.grupos[0].id,
    );
    expect((await como().post(`/platos/${mb.casado}/duplicar`)).status).toBe(404);
  });
});

describe('guardar grupos de modificadores', () => {
  it('actualiza, crea y borra grupos y opciones de una vez', async () => {
    const actual = (await como().get(`/platos/${m.casado}`)).body.grupos;
    const termino = actual[0];
    const res = await como()
      .put(`/platos/${m.casado}/grupos-modificadores`)
      .send({
        grupos: [
          {
            ...termino,
            nombreEs: 'Término de la carne',
            modificadores: [
              { ...termino.modificadores[0], nombreEs: 'Medio' },
              { nombreEs: 'Tres cuartos', nombreEn: 'Medium well', precioExtra: 0 },
            ],
          },
          {
            nombreEs: 'Acompañamiento',
            nombreEn: 'Side',
            obligatorio: false,
            minimo: 0,
            maximo: 1,
            modificadores: [{ nombreEs: 'Papas', nombreEn: 'Fries', precioExtra: 80000 }],
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.map((g: { nombreEs: string }) => g.nombreEs)).toEqual([
      'Término de la carne',
      'Acompañamiento',
    ]);
    expect(res.body[0].id).toBe(termino.id); // se actualizó, no se recreó
    expect(res.body[0].modificadores.map((x: { nombreEs: string }) => x.nombreEs)).toEqual([
      'Medio',
      'Tres cuartos',
    ]);
    // "Extras" y "Bien cocido" se borraron.
    expect(await prisma.grupoModificadores.count({ where: { platoId: m.casado } })).toBe(2);
    expect(
      await prisma.modificador.count({ where: { nombreEs: 'Bien cocido', restauranteId } }),
    ).toBe(0);
  });

  it('valida mínimos y máximos junto a cada campo', async () => {
    const res = await como()
      .put(`/platos/${m.casado}/grupos-modificadores`)
      .send({
        grupos: [
          {
            nombreEs: 'X',
            nombreEn: 'X',
            obligatorio: true,
            minimo: 0,
            maximo: 1,
            modificadores: [{ nombreEs: 'a', nombreEn: 'a', precioExtra: 0 }],
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.error.details)).toMatch(/obligatorio necesita mínimo 1/);
  });

  it('no acepta ids de grupos u opciones de otro plato o restaurante', async () => {
    const ajeno = (
      await prisma.grupoModificadores.findFirstOrThrow({ where: { platoId: mb.casado } })
    ).id;
    const res = await como()
      .put(`/platos/${m.casado}/grupos-modificadores`)
      .send({
        grupos: [
          {
            id: ajeno,
            nombreEs: 'X',
            nombreEn: 'X',
            obligatorio: false,
            minimo: 0,
            maximo: 1,
            modificadores: [{ nombreEs: 'a', nombreEn: 'a', precioExtra: 0 }],
          },
        ],
      });
    expect(res.status).toBe(404);
    expect(await prisma.grupoModificadores.count({ where: { id: ajeno } })).toBe(1);
    expect(
      (await como().put(`/platos/${mb.casado}/grupos-modificadores`).send({ grupos: [] })).status,
    ).toBe(404);
  });

  it('cambiar el precio de un plato no altera pedidos ya hechos', async () => {
    const s = (await request(app).get(`/public/mesa/${m.mesa.tokenQr}`)).body;
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { modoConfirmacion: 'NUNCA' },
    });
    await request(app)
      .post('/public/cuenta/pedidos')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ clientRequestId: 'precio-1', items: [{ platoId: m.refresco, cantidad: 1 }] });
    await como().patch(`/platos/${m.refresco}`).send({ precio: 999900 });
    const item = await prisma.pedidoItem.findFirstOrThrow({ where: { platoId: m.refresco } });
    expect(item.precioUnitario).toBe(150000);
  });
});
