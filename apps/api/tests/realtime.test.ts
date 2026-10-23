import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as cliente, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { iniciarRealtime } from '../src/realtime';
import {
  abrirSesion,
  crearRestaurante,
  crearUsuario,
  limpiarBD,
  nuevoRequestId,
  sembrarMenu,
  tokenDe,
} from './helpers';

let server: Server;
let url: string;
let m: Awaited<ReturnType<typeof sembrarMenu>>;
let mb: Awaited<ReturnType<typeof sembrarMenu>>;
const sockets: Socket[] = [];

const conectar = (auth: { token?: string; sesion?: string }) =>
  new Promise<Socket>((resolve, reject) => {
    const s = cliente(url, { auth, transports: ['websocket'], reconnection: false });
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
  const b = await crearRestaurante('resto-b');
  m = await sembrarMenu(a.restaurante.id);
  mb = await sembrarMenu(b.restaurante.id);
  await prisma.restaurante.updateMany({ data: { modoConfirmacion: 'NUNCA' } });
  await crearUsuario('cocina@resto-a.test', 'COCINA', a.restaurante.id);
  const bar = await crearUsuario('bar@resto-a.test', 'COCINA', a.restaurante.id);
  await prisma.usuario.update({ where: { id: bar.id }, data: { estacionId: m.estaciones.bar } });
  await crearUsuario('mesero@resto-a.test', 'MESERO', a.restaurante.id);
  await crearUsuario('admin@x.test', 'SUPERADMIN', null);

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
  it('rechaza conexiones sin credenciales, sin restaurante o con sesión inválida', async () => {
    await expect(conectar({})).rejects.toThrow('NO_AUTENTICADO');
    await expect(conectar({ token: await tokenDe('admin@x.test') })).rejects.toThrow(
      'SIN_RESTAURANTE',
    );
    await expect(conectar({ sesion: 'inventada' })).rejects.toThrow('SESION_INVALIDA');
  });

  it('ping → pong', async () => {
    const s = await conectar({ token: await tokenDe('cocina@resto-a.test') });
    const pong = esperar(s, 'pong');
    s.emit('ping');
    expect(await pong).toHaveProperty('ts');
  });

  it('un pedido confirmado llega solo a la sala de su estación, con solo sus ítems', async () => {
    const cocina = await conectar({ token: await tokenDe('cocina@resto-a.test') }); // todas las estaciones
    const bar = await conectar({ token: await tokenDe('bar@resto-a.test') }); // solo bar
    const duenoB = await conectar({ token: await tokenDe('dueno@resto-b.test') });
    const enCocina = esperar(cocina, 'pedido:confirmado');
    const enBar = esperar(bar, 'pedido:confirmado');
    const enB = esperar(duenoB, 'pedido:confirmado');

    const s = await abrirSesion(m.mesa.tokenQr);
    await request(app)
      .post('/public/cuenta/pedidos')
      .set('Authorization', `Bearer ${s.token}`)
      .send({
        clientRequestId: nuevoRequestId(),
        items: [{ platoId: m.casado, cantidad: 1, modificadores: [m.termino[0]] }],
      });

    const evento = (await enCocina) as {
      items: { nombreEs: string }[];
      mesa: { numero: number };
      updatedAt: string;
    };
    expect(evento.items.map((i) => i.nombreEs)).toEqual(['Casado']);
    expect(evento.mesa.numero).toBe(1);
    expect(evento.updatedAt).toBeTypeOf('string');
    expect(await enBar).toBeNull();
    expect(await enB).toBeNull();
  });

  it('los celulares de una mesa ven los cambios de su cuenta y no los de otra', async () => {
    const s1 = await abrirSesion(m.mesa.tokenQr);
    const s2 = await abrirSesion(m.mesa.tokenQr); // segundo celular, misma cuenta
    const otra = await abrirSesion(m.mesa2.tokenQr);
    const cel1 = await conectar({ sesion: s1.token });
    const cel2 = await conectar({ sesion: s2.token });
    const celOtra = await conectar({ sesion: otra.token });
    const en1 = esperar(cel1, 'cuenta:actualizada');
    const en2 = esperar(cel2, 'cuenta:actualizada');
    const enOtra = esperar(celOtra, 'cuenta:actualizada');

    await request(app)
      .post('/public/cuenta/pedidos')
      .set('Authorization', `Bearer ${s1.token}`)
      .send({ clientRequestId: nuevoRequestId(), items: [{ platoId: m.refresco, cantidad: 1 }] });

    expect(await en1).toMatchObject({ cuentaId: s1.cuentaId });
    expect(await en2).toMatchObject({ cuentaId: s1.cuentaId });
    expect(await enOtra).toBeNull();
  });

  it('marcar agotado avisa al personal y a los comensales del restaurante, no a otro', async () => {
    const mesero = await conectar({ token: await tokenDe('mesero@resto-a.test') });
    const comensal = await conectar({ sesion: (await abrirSesion(m.mesa.tokenQr)).token });
    const comensalB = await conectar({ sesion: (await abrirSesion(mb.mesa.tokenQr)).token });
    const eventos = [mesero, comensal, comensalB].map((s) => esperar(s, 'menu:actualizado'));

    const res = await request(app)
      .patch(`/platos/${m.refresco}/agotado`)
      .set('Authorization', `Bearer ${await tokenDe('dueno@resto-a.test')}`)
      .send({ agotado: true });
    expect(res.status).toBe(200);
    const [enMesero, enComensal, enB] = await Promise.all(eventos);
    expect(enMesero).toMatchObject({ platoId: m.refresco, agotado: true });
    expect(enComensal).toMatchObject({ platoId: m.refresco, agotado: true });
    expect(enB).toBeNull();
  });

  it('llamar al mesero suena; si vuelve a llamar sin ser atendida, se recuerda (no antes de 30 s)', async () => {
    const mesero = await conectar({ token: await tokenDe('mesero@resto-a.test') });
    const sesion = await abrirSesion(m.mesa2.tokenQr);
    const llamar = () =>
      request(app)
        .post('/public/cuenta/llamar')
        .set('Authorization', `Bearer ${sesion.token}`)
        .send({ tipo: 'MESERO' });
    const primera = esperar(mesero, 'mesa:llamada');
    await llamar();
    expect(await primera).toMatchObject({ mesa: { numero: 2 }, tipo: 'MESERO' });

    const enseguida = esperar(mesero, 'mesa:llamada', 300);
    await llamar();
    expect(await enseguida).toBeNull(); // spam: no suena otra vez

    await prisma.llamada.updateMany({
      where: { mesaId: m.mesa2.id },
      data: { updatedAt: new Date(Date.now() - 60_000) },
    });
    const recordatorio = esperar(mesero, 'mesa:llamada');
    await llamar();
    expect(await recordatorio).toMatchObject({ mesa: { numero: 2 } });
    expect(await prisma.llamada.count({ where: { mesaId: m.mesa2.id, atendida: false } })).toBe(1);
  });

  it('la sesión de una cuenta cerrada no se puede conectar', async () => {
    const s = await abrirSesion(m.mesa2.tokenQr);
    await prisma.cuenta.update({ where: { id: s.cuentaId }, data: { estado: 'CERRADA' } });
    await expect(conectar({ sesion: s.token })).rejects.toThrow('CUENTA_CERRADA');
  });
});
