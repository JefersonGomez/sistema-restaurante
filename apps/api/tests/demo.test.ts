import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminRestauranteFila, DemoInfo } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { borrarVencidas } from '../src/modules/demo/demo.service';
import { crearRestaurante, crearUsuario, limpiarBD, PASSWORD, tokenDe } from './helpers';

const con = (t: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
  put: (u: string) => request(app).put(u).set('Authorization', `Bearer ${t}`),
});
const nuevaDemo = async (rol: string) => {
  const r = await request(app).post('/demo').send({ rol });
  expect(r.status).toBe(201);
  return r;
};

beforeEach(limpiarBD);

describe('demo de una visita (Fase 21)', () => {
  it('crea un restaurante propio con datos de ejemplo y entra con el rol elegido', async () => {
    const r = await nuevaDemo('MESERO');
    expect(r.body.usuario).toMatchObject({ rol: 'MESERO', restaurante: { esDemo: true } });
    expect(r.headers['set-cookie']?.[0]).toMatch(/^refreshToken=/);

    const restauranteId = r.body.usuario.restauranteId as string;
    const where = { restauranteId };
    expect(await prisma.plato.count({ where })).toBe(12);
    expect(await prisma.mesa.count({ where })).toBe(8);
    expect(await prisma.usuario.count({ where })).toBe(5);
    expect(await prisma.cuenta.count({ where: { ...where, estado: 'CERRADA' } })).toBeGreaterThan(
      100,
    );
    // Fotos de ejemplo compartidas entre demos (no se borran con cada una).
    const plato = await prisma.plato.findFirstOrThrow({ where });
    expect(plato.fotoUrl).toContain('/demo/platos/');

    const info = (await con(r.body.accessToken).get('/demo')).body as DemoInfo;
    expect(info.enLineaUrl).toMatch(/\/r\/demo-[0-9a-f]{10}$/);
    expect(info.mesaUrl).toMatch(/\/m\/.+/);
    expect(Math.round((Date.parse(info.expiraEn) - Date.now()) / 3_600_000)).toBe(24);
  }, 60_000);

  it('cambia de rol dentro de la misma demo; cada visita tiene la suya', async () => {
    const a = await nuevaDemo('COCINA');
    const b = await nuevaDemo('DUENO');
    expect(a.body.usuario.restauranteId).not.toBe(b.body.usuario.restauranteId);

    const dueno = await con(a.body.accessToken).post('/demo/rol').send({ rol: 'DUENO' });
    expect(dueno.status).toBe(200);
    expect(dueno.body.usuario).toMatchObject({
      rol: 'DUENO',
      restauranteId: a.body.usuario.restauranteId,
    });
    const mesas = await con(dueno.body.accessToken).get('/mesas');
    expect(mesas.status).toBe(200);
    expect(mesas.body).toHaveLength(8);
  }, 60_000);

  it('bloquea lo riesgoso y no deja usar /demo fuera de una demo', async () => {
    const r = await nuevaDemo('DUENO');
    const t = r.body.accessToken as string;
    const clave = await con(t)
      .post('/auth/cambiar-password')
      .send({ actual: 'x', nueva: 'OtraClave123!' });
    expect(clave.status).toBe(403);
    expect(clave.body.error.code).toBe('DEMO_NO_PERMITIDO');
    expect((await con(t).post('/hacienda/probar')).body.error.code).toBe('DEMO_NO_PERMITIDO');

    const { dueno } = await crearRestaurante('real');
    const real = await tokenDe(dueno.email);
    expect((await con(real).post('/demo/rol').send({ rol: 'CAJA' })).status).toBe(404);
    expect((await con(real).get('/demo')).status).toBe(404);
    expect((await request(app).post('/demo').send({ rol: 'SUPERADMIN' })).status).toBe(400);
  }, 60_000);

  it('el superadmin no ve las demos y se borran solas a las 24 h', async () => {
    await nuevaDemo('CAJA');
    await crearRestaurante('real');
    await crearUsuario('admin@x.test', 'SUPERADMIN', null);
    const admin = await tokenDe('admin@x.test');
    const filas = (await con(admin).get('/admin/restaurantes')).body as AdminRestauranteFila[];
    expect(filas.map((f) => f.nombre)).toEqual(['real']);
    expect((await con(admin).get('/admin/resumen')).body.restaurantes).toBe(1);

    expect(await borrarVencidas()).toBe(0); // recién creada
    expect(await borrarVencidas(new Date(Date.now() + 25 * 3_600_000))).toBe(1);
    expect(await prisma.restaurante.count({ where: { esDemo: true } })).toBe(0);
    expect(await prisma.cuenta.count()).toBe(0);
    expect(await prisma.usuario.count({ where: { email: { contains: '@demo.' } } })).toBe(0);
    // El restaurante real sigue intacto.
    expect(await tokenDe('dueno@real.test')).toBeTruthy();
    expect(PASSWORD).toBeTruthy();
  }, 60_000);
});
