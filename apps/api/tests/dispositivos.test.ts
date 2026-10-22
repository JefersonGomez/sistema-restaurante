import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as cliente, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { iniciarRealtime } from '../src/realtime';
import { crearRestaurante, crearUsuario, limpiarBD, sembrarMenu, tokenDe } from './helpers';

let server: Server;
let url: string;
let restauranteA: string;
let m: Awaited<ReturnType<typeof sembrarMenu>>;
let dueno: string;
let cocinero: string; // COCINA sin estación (puede entrar en cualquier tablet)
const sockets: Socket[] = [];

const comoDueno = (t = dueno) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
  put: (u: string) => request(app).put(u).set('Authorization', `Bearer ${t}`),
  delete: (u: string) => request(app).delete(u).set('Authorization', `Bearer ${t}`),
});
const tablet = (token: string) => ({
  yo: () => request(app).get('/dispositivos/tablet').set('X-Dispositivo', token),
  entrar: (usuarioId: string, pin: string) =>
    request(app)
      .post('/dispositivos/tablet/entrar')
      .set('X-Dispositivo', token)
      .send({ usuarioId, pin }),
});

// Código nuevo para la estación de cocina y su canje → token del dispositivo.
async function vincularTablet(estacionId = m.estaciones.cocina) {
  const { body } = await comoDueno()
    .post('/dispositivos/codigo')
    .send({ nombre: 'Tablet cocina', estacionId });
  const res = await request(app).post('/dispositivos/vincular').send({ codigo: body.codigo });
  expect(res.status).toBe(201);
  return { token: res.body.tokenDispositivo as string, id: body.id as string };
}

beforeAll(async () => {
  server = createServer(app);
  iniciarRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => server.close(r));
});

beforeEach(async () => {
  await limpiarBD();
  restauranteA = (await crearRestaurante('resto-a')).restaurante.id;
  await crearRestaurante('resto-b');
  m = await sembrarMenu(restauranteA);
  dueno = await tokenDe('dueno@resto-a.test');
  cocinero = (await crearUsuario('cocina@resto-a.test', 'COCINA', restauranteA)).id;
  await comoDueno().put(`/usuarios/${cocinero}/pin`).send({ pin: '1234' });
});

describe('vincular tablet', () => {
  it('código de 6 dígitos → token; la tablet lista quién puede entrar con PIN', async () => {
    const { body: codigo } = await comoDueno()
      .post('/dispositivos/codigo')
      .send({ nombre: 'Tablet cocina', estacionId: m.estaciones.cocina });
    expect(codigo.codigo).toMatch(/^\d{6}$/);
    expect(new Date(codigo.codigoExpira).getTime() - Date.now()).toBeGreaterThan(9 * 60_000);

    const res = await request(app).post('/dispositivos/vincular').send({ codigo: codigo.codigo });
    expect(res.status).toBe(201);
    expect(res.body.dispositivo.estacion.nombre).toBe('Cocina');
    // Solo el personal de cocina con PIN y de esta estación (o de todas).
    const bar = await crearUsuario('bar@resto-a.test', 'COCINA', restauranteA);
    await prisma.usuario.update({
      where: { id: bar.id },
      data: { estacionId: m.estaciones.bar, pinHash: 'x' },
    });
    await crearUsuario('sinpin@resto-a.test', 'COCINA', restauranteA);
    const yo = await tablet(res.body.tokenDispositivo).yo();
    expect(yo.body.personal.map((p: { id: string }) => p.id)).toEqual([cocinero]);

    const lista = await comoDueno().get('/dispositivos');
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].vinculadoEn).toBeTruthy();
    expect(lista.body[0]).not.toHaveProperty('tokenHash');
  });

  it('rechaza el código vencido y el ya usado', async () => {
    const { body } = await comoDueno()
      .post('/dispositivos/codigo')
      .send({ nombre: 'Vieja', estacionId: m.estaciones.cocina });
    await prisma.dispositivo.update({
      where: { id: body.id },
      data: { codigoExpira: new Date(Date.now() - 1000) },
    });
    const vencido = await request(app).post('/dispositivos/vincular').send({ codigo: body.codigo });
    expect(vencido.status).toBe(410);
    expect(vencido.body.error.code).toBe('CODIGO_VENCIDO');

    const { body: otro } = await comoDueno()
      .post('/dispositivos/codigo')
      .send({ nombre: 'Nueva', estacionId: m.estaciones.cocina });
    expect(
      (await request(app).post('/dispositivos/vincular').send({ codigo: otro.codigo })).status,
    ).toBe(201);
    const reusado = await request(app).post('/dispositivos/vincular').send({ codigo: otro.codigo });
    expect(reusado.status).toBe(404);
    expect(reusado.body.error.code).toBe('CODIGO_INVALIDO');
  });

  it('un dueño no puede usar estaciones ni revocar tablets de otro restaurante', async () => {
    const otro = await tokenDe('dueno@resto-b.test');
    const ajena = await comoDueno(otro)
      .post('/dispositivos/codigo')
      .send({ nombre: 'X', estacionId: m.estaciones.cocina });
    expect(ajena.status).toBe(404);
    const { id } = await vincularTablet();
    expect((await comoDueno(otro).delete(`/dispositivos/${id}`)).status).toBe(404);
    expect((await comoDueno(otro).get('/dispositivos')).body).toEqual([]);
  });
});

describe('entrar con PIN', () => {
  it('el PIN abre una sesión limitada a la estación de la tablet', async () => {
    const { token } = await vincularTablet();
    const res = await tablet(token).entrar(cocinero, '1234');
    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('COCINA');
    // El cocinero no tiene estación asignada, pero en esta tablet solo ve Cocina.
    const est = await request(app)
      .get('/operacion/estaciones')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(est.body.map((e: { id: string }) => e.id)).toEqual([m.estaciones.cocina]);
    const bar = await request(app)
      .get(`/operacion/estaciones/${m.estaciones.bar}/items`)
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(bar.status).toBe(403);
  });

  it('bloquea a la persona tras 5 PIN incorrectos, aunque luego ponga el correcto', async () => {
    const { token } = await vincularTablet();
    for (let i = 4; i >= 1; i--) {
      const mal = await tablet(token).entrar(cocinero, '0000');
      expect(mal.status).toBe(401);
      expect(mal.body.error.details.intentosRestantes).toBe(i);
    }
    expect((await tablet(token).entrar(cocinero, '0000')).status).toBe(429);
    const bloqueado = await tablet(token).entrar(cocinero, '1234');
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error.code).toBe('PIN_BLOQUEADO');
    // Al poner un PIN nuevo, el dueño lo desbloquea.
    await comoDueno().put(`/usuarios/${cocinero}/pin`).send({ pin: '4321' });
    expect((await tablet(token).entrar(cocinero, '4321')).status).toBe(200);
  });

  it('sin tablet vinculada no se puede entrar con PIN', async () => {
    expect((await tablet('inventado').entrar(cocinero, '1234')).status).toBe(401);
  });
});

describe('revocar', () => {
  it('la tablet revocada pierde el socket, la API y no puede volver a conectarse', async () => {
    const { token, id } = await vincularTablet();
    const { accessToken } = (await tablet(token).entrar(cocinero, '1234')).body;
    const conectar = () =>
      new Promise<Socket>((resolve, reject) => {
        const s = cliente(url, {
          auth: { token: accessToken },
          transports: ['websocket'],
          reconnection: false,
        });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const s = await conectar();
    const cortado = new Promise((r) => s.on('disconnect', r));

    expect((await comoDueno().delete(`/dispositivos/${id}`)).status).toBe(204);
    await cortado;
    await expect(conectar()).rejects.toThrow('DISPOSITIVO_REVOCADO');
    const api = await request(app)
      .get('/operacion/estaciones')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(api.body.error.code).toBe('DISPOSITIVO_REVOCADO');
    expect((await tablet(token).yo()).status).toBe(401);
    expect((await comoDueno().get('/dispositivos')).body).toEqual([]);
  });
});
