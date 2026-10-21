import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as cliente, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { emitToRestaurant, iniciarRealtime } from '../src/realtime';
import { crearRestaurante, crearUsuario, limpiarBD, tokenDe } from './helpers';

let server: Server;
let url: string;
let restauranteA: string;
let platoA: string;
const sockets: Socket[] = [];

const conectar = (token?: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = cliente(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });

// Resuelve con el payload si llega el evento, o con null si no llega en `ms`.
const esperar = (s: Socket, evento: string, ms = 500) =>
  new Promise<unknown>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    s.once(evento, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });

beforeAll(async () => {
  await limpiarBD();
  const a = await crearRestaurante('resto-a');
  await crearRestaurante('resto-b');
  restauranteA = a.restaurante.id;
  await crearUsuario('cocina@resto-a.test', 'COCINA', restauranteA);
  await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteA);
  await crearUsuario('admin@x.test', 'SUPERADMIN', null);
  const estacion = await prisma.estacion.create({
    data: { restauranteId: restauranteA, nombre: 'Cocina' },
  });
  const cat = await prisma.categoria.create({
    data: { restauranteId: restauranteA, nombreEs: 'C', nombreEn: 'C' },
  });
  platoA = (
    await prisma.plato.create({
      data: {
        restauranteId: restauranteA,
        categoriaId: cat.id,
        estacionId: estacion.id,
        nombreEs: 'P',
        nombreEn: 'P',
        precio: 100,
      },
    })
  ).id;

  server = createServer(app);
  iniciarRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => server.close(r));
});

describe('Socket.IO', () => {
  it('rechaza conexiones sin token o sin restaurante', async () => {
    await expect(conectar()).rejects.toThrow('NO_AUTENTICADO');
    await expect(conectar(await tokenDe('admin@x.test'))).rejects.toThrow('SIN_RESTAURANTE');
  });

  it('ping → pong', async () => {
    const s = await conectar(await tokenDe('cocina@resto-a.test'));
    const pong = esperar(s, 'pong');
    s.emit('ping');
    expect(await pong).toHaveProperty('ts');
  });

  it('emitToRestaurant llega solo a la sala correcta', async () => {
    const cocina = await conectar(await tokenDe('cocina@resto-a.test'));
    const mesero = await conectar(await tokenDe('mesero@resto-a.test'));
    const enCocina = esperar(cocina, 'prueba');
    const enMesero = esperar(mesero, 'prueba');
    emitToRestaurant(restauranteA, 'cocina', 'prueba', { hola: 1 });
    expect(await enCocina).toEqual({ hola: 1 });
    expect(await enMesero).toBeNull();
  });

  it('marcar agotado emite menu:actualizado solo al restaurante del plato', async () => {
    const mesero = await conectar(await tokenDe('mesero@resto-a.test'));
    const duenoB = await conectar(await tokenDe('dueno@resto-b.test'));
    const enA = esperar(mesero, 'menu:actualizado');
    const enB = esperar(duenoB, 'menu:actualizado');

    const res = await request(app)
      .patch(`/platos/${platoA}/agotado`)
      .set('Authorization', `Bearer ${await tokenDe('dueno@resto-a.test')}`)
      .send({ agotado: true });
    expect(res.status).toBe(200);
    expect(await enA).toEqual({ platoId: platoA, agotado: true });
    expect(await enB).toBeNull();
  });
});
