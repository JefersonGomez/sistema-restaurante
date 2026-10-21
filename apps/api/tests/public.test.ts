import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, limpiarBD } from './helpers';

let tokenMesaA: string;

async function sembrarMenu(restauranteId: string, prefijo: string) {
  const estacionId = (await prisma.estacion.create({ data: { restauranteId, nombre: 'Cocina' } }))
    .id;
  const activa = await prisma.categoria.create({
    data: { restauranteId, nombreEs: `${prefijo} Activa`, nombreEn: 'Active', orden: 1 },
  });
  const inactiva = await prisma.categoria.create({
    data: { restauranteId, nombreEs: `${prefijo} Inactiva`, nombreEn: 'Inactive', activa: false },
  });
  const plato = (categoriaId: string, nombreEs: string, extra = {}) =>
    prisma.plato.create({
      data: {
        restauranteId,
        categoriaId,
        estacionId,
        nombreEs,
        nombreEn: nombreEs,
        precio: 100,
        ...extra,
      },
    });
  await plato(activa.id, `${prefijo} Normal`);
  await plato(activa.id, `${prefijo} Agotado`, { agotado: true });
  await plato(activa.id, `${prefijo} Inactivo`, { activo: false });
  await plato(inactiva.id, `${prefijo} En categoría inactiva`);
}

beforeAll(async () => {
  await limpiarBD();
  const a = await crearRestaurante('resto-a');
  const b = await crearRestaurante('resto-b');
  await sembrarMenu(a.restaurante.id, 'A');
  await sembrarMenu(b.restaurante.id, 'B');
  tokenMesaA = 'token-mesa-a-suficientemente-largo';
  await prisma.mesa.create({
    data: { restauranteId: a.restaurante.id, numero: 3, tokenQr: tokenMesaA },
  });
});

describe('GET /public/:slug/menu', () => {
  it('trae solo categorías y platos activos del restaurante; agotados marcados', async () => {
    const res = await request(app).get('/public/resto-a/menu');
    expect(res.status).toBe(200);
    expect(res.body.restaurante).toMatchObject({ slug: 'resto-a', moneda: 'CRC' });
    expect(res.body.restaurante.id).toBeUndefined();

    const nombres = res.body.categorias.flatMap((c: { platos: { nombreEs: string }[] }) =>
      c.platos.map((p) => p.nombreEs),
    );
    expect(nombres.sort()).toEqual(['A Agotado', 'A Normal']);
    expect(res.body.categorias.map((c: { nombreEs: string }) => c.nombreEs)).toEqual(['A Activa']);

    const agotado = res.body.categorias[0].platos.find(
      (p: { nombreEs: string }) => p.nombreEs === 'A Agotado',
    );
    expect(agotado.agotado).toBe(true);
    expect(res.body.categorias[0]).toHaveProperty('icono');
    expect(agotado).toMatchObject({ destacado: false });
    expect(res.body.restaurante).toMatchObject({ abierto: true });
  });

  it('no devuelve datos de otro restaurante', async () => {
    const texto = JSON.stringify((await request(app).get('/public/resto-a/menu')).body);
    expect(texto).not.toMatch(/"B /);
  });

  it('slug inexistente o restaurante inactivo → 404', async () => {
    expect((await request(app).get('/public/no-existe/menu')).status).toBe(404);
    await prisma.restaurante.update({ where: { slug: 'resto-b' }, data: { activo: false } });
    expect((await request(app).get('/public/resto-b/menu')).status).toBe(404);
  });
});

describe('GET /public/mesa/:token', () => {
  it('devuelve slug, número de mesa, cuenta y sesión', async () => {
    const res = await request(app).get(`/public/mesa/${tokenMesaA}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: 'resto-a',
      restaurante: 'resto-a',
      numero: 3,
      nombre: null,
    });
    expect(res.body.cuentaId).toBeTypeOf('string');
    expect(res.body.token).toBeTypeOf('string');
  });

  it('token inexistente o mesa inactiva → 404', async () => {
    expect((await request(app).get('/public/mesa/token-que-no-existe-en-la-bd')).status).toBe(404);
    await prisma.mesa.update({ where: { tokenQr: tokenMesaA }, data: { activa: false } });
    expect((await request(app).get(`/public/mesa/${tokenMesaA}`)).status).toBe(404);
  });
});

describe('GET /health', () => {
  it('responde ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ ok: true });
  });
});
