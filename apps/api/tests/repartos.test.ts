import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CuentaDetalle, EfectivoRepartidor, SeguimientoEnLinea } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  crearRestaurante,
  crearUsuario,
  limpiarBD,
  nuevoRequestId,
  sembrarMenu,
  tokenDe,
} from './helpers';

let m: Awaited<ReturnType<typeof sembrarMenu>>;
let restauranteId: string;
let caja: string;
let mesero: string;
let pepe: { id: string; token: string };
let luis: { id: string; token: string };

const como = (t: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
});
const domicilio = (cliente: object = {}, pago = 'EFECTIVO') =>
  request(app)
    .post('/public/resto-a/pedidos-en-linea')
    .send({
      clientRequestId: nuevoRequestId(),
      tipo: 'DOMICILIO',
      cliente: {
        nombre: 'Ana',
        telefono: '8888 1234',
        direccion: 'Del parque 200 m norte',
        ...cliente,
      },
      pago: { metodo: pago },
      items: [{ platoId: m.refresco, cantidad: 2 }],
    });
// Pedido a domicilio ya aceptado por la caja; devuelve su id.
const aceptado = async (cliente: object = {}) => {
  const r = await domicilio(cliente);
  const s = (await request(app).get(`/public/seguimiento/${r.body.token}`))
    .body as SeguimientoEnLinea;
  await como(caja).post(`/enlinea/${s.cuenta.id}/aceptar`).send({ tiempoEstimadoMin: 30 });
  return s.cuenta.id;
};
const repartidor = async (email: string) => {
  const u = await crearUsuario(email, 'REPARTIDOR', restauranteId);
  return { id: u.id, token: await tokenDe(email) };
};

beforeEach(async () => {
  await limpiarBD();
  restauranteId = (await crearRestaurante('resto-a')).restaurante.id;
  m = await sembrarMenu(restauranteId);
  await prisma.horarioRestaurante.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      restauranteId,
      diaSemana,
      abre: '00:00',
      cierra: '23:59',
    })),
  });
  await prisma.restaurante.update({
    where: { id: restauranteId },
    data: { enLineaActivo: true, enLineaRecoger: true, enLineaDomicilio: true, costoEnvio: 100000 },
  });
  await crearUsuario('caja@resto-a.test', 'CAJA', restauranteId);
  await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteId);
  caja = await tokenDe('caja@resto-a.test');
  mesero = await tokenDe('mesero@resto-a.test');
  pepe = await repartidor('pepe@resto-a.test');
  luis = await repartidor('luis@resto-a.test');
});

describe('domicilio: ubicación y repartidores', () => {
  it('guarda el punto marcado en el mapa y valida sus rangos', async () => {
    const id = await aceptado({ ubicacion: { lat: 9.9326, lng: -84.0796 } });
    const [c] = (await como(caja).get('/enlinea')).body as CuentaDetalle[];
    expect(c!.id).toBe(id);
    expect(c!.enLinea?.ubicacion).toEqual({ lat: 9.9326, lng: -84.0796 });
    expect((await domicilio({ ubicacion: { lat: 95, lng: 0 } })).status).toBe(400);
  });

  it('asignar: solo a domicilio, después de aceptar y a un repartidor activo del restaurante', async () => {
    const id = await aceptado();
    const asignar = (repartidorId: string, cuenta = id) =>
      como(mesero).post(`/enlinea/${cuenta}/repartidor`).send({ repartidorId });

    // Repartidor de otro restaurante o un usuario que no es repartidor: 404.
    const otro = (await crearRestaurante('resto-b')).restaurante.id;
    const ajeno = await crearUsuario('rep@resto-b.test', 'REPARTIDOR', otro);
    expect((await asignar(ajeno.id)).status).toBe(404);
    const cajero = await prisma.usuario.findFirstOrThrow({ where: { rol: 'CAJA' } });
    expect((await asignar(cajero.id)).status).toBe(404);

    const ok = await asignar(pepe.id);
    expect(ok.body.enLinea.repartidor).toEqual({ id: pepe.id, nombre: 'pepe@resto-a.test' });
    expect((await como(caja).get('/enlinea/repartidores')).body).toHaveLength(2);

    // Para recoger no lleva repartidor.
    const recoger = await request(app)
      .post('/public/resto-a/pedidos-en-linea')
      .send({
        clientRequestId: nuevoRequestId(),
        tipo: 'RECOGER',
        cliente: { nombre: 'Eva', telefono: '8777 0000' },
        pago: { metodo: 'EFECTIVO' },
        items: [{ platoId: m.refresco, cantidad: 1 }],
      });
    const r = (await request(app).get(`/public/seguimiento/${recoger.body.token}`)).body;
    expect((await asignar(pepe.id, r.cuenta.id)).status).toBe(409);
  });

  it('el repartidor solo ve y mueve sus entregas; sale cuando está listo y cobra', async () => {
    const id = await aceptado();
    await como(caja).post(`/enlinea/${id}/repartidor`).send({ repartidorId: pepe.id });

    expect((await como(pepe.token).get('/repartos')).body.map((c: CuentaDetalle) => c.id)).toEqual([
      id,
    ]);
    expect((await como(luis.token).get('/repartos')).body).toEqual([]);
    expect((await como(luis.token).post(`/repartos/${id}/salir`)).status).toBe(404);

    // Sale solo cuando cocina terminó ("Listo para entregar").
    expect((await como(pepe.token).post(`/repartos/${id}/salir`)).status).toBe(409);
    await como(caja).post(`/enlinea/${id}/etapa`).send({ etapa: 'LISTO' });
    const salio = await como(pepe.token).post(`/repartos/${id}/salir`);
    expect(salio.body.enLinea.etapa).toBe('EN_CAMINO');

    // Ya salió: no se cambia de repartidor.
    expect(
      (await como(caja).post(`/enlinea/${id}/repartidor`).send({ repartidorId: luis.id })).status,
    ).toBe(409);

    expect(
      (await como(luis.token).post(`/repartos/${id}/entregar`).send({ metodoPago: 'EFECTIVO' }))
        .status,
    ).toBe(404);
    const fin = await como(pepe.token)
      .post(`/repartos/${id}/entregar`)
      .send({ metodoPago: 'EFECTIVO' });
    expect(fin.body).toMatchObject({ estado: 'CERRADA', metodoPago: 'EFECTIVO' });
    expect(fin.body.enLinea.etapa).toBe('ENTREGADO');
  });

  it('caja: efectivo por repartidor hasta marcarlo recibido', async () => {
    let n = 10;
    const entregar = async (rep: { id: string; token: string }, metodoPago: string) => {
      const id = await aceptado({ telefono: `8800 00${++n}` });
      await como(caja).post(`/enlinea/${id}/repartidor`).send({ repartidorId: rep.id });
      await como(caja).post(`/enlinea/${id}/etapa`).send({ etapa: 'LISTO' });
      await como(rep.token).post(`/repartos/${id}/salir`);
      return (await como(rep.token).post(`/repartos/${id}/entregar`).send({ metodoPago })).body
        .total as number;
    };
    const t1 = await entregar(pepe, 'EFECTIVO');
    const t2 = await entregar(pepe, 'EFECTIVO');
    await entregar(pepe, 'TARJETA'); // no es efectivo: no se cuadra
    const t3 = await entregar(luis, 'EFECTIVO');

    const lista = (await como(caja).get('/enlinea/efectivo')).body as EfectivoRepartidor[];
    expect(lista).toEqual([
      { repartidor: { id: luis.id, nombre: 'luis@resto-a.test' }, pedidos: 1, total: t3 },
      { repartidor: { id: pepe.id, nombre: 'pepe@resto-a.test' }, pedidos: 2, total: t1 + t2 },
    ]);

    // El mesero no cuadra efectivo; el repartidor no entra a "En línea".
    expect((await como(mesero).get('/enlinea/efectivo')).status).toBe(403);
    expect((await como(pepe.token).get('/enlinea')).status).toBe(403);

    const recibido = await como(caja)
      .post('/enlinea/efectivo/recibir')
      .send({ repartidorId: pepe.id });
    expect(recibido.body).toEqual({ pedidos: 2 });
    expect((await como(caja).get('/enlinea/efectivo')).body).toHaveLength(1);
  });
});

describe('rastreo del repartidor (Fase 17.3)', () => {
  it('comparte la ubicación solo con el pedido en camino y la borra al entregar', async () => {
    const r = await domicilio({ ubicacion: { lat: 9.9326, lng: -84.0796 } });
    const token = r.body.token as string;
    const seguir = async () =>
      (await request(app).get(`/public/seguimiento/${token}`)).body as SeguimientoEnLinea;
    const id = (await seguir()).cuenta.id;
    await como(caja).post(`/enlinea/${id}/aceptar`).send({ tiempoEstimadoMin: 30 });
    const pepe = await repartidor('moto@resto-a.test');
    await como(caja).post(`/enlinea/${id}/repartidor`).send({ repartidorId: pepe.id });
    const punto = { lat: 9.934, lng: -84.07 };

    // Todavía no salió: no se guarda nada.
    expect((await como(pepe.token).post('/repartos/ubicacion').send(punto)).body).toEqual({
      compartiendo: false,
    });
    expect((await seguir()).repartidor).toBeNull();

    await como(caja).post(`/enlinea/${id}/etapa`).send({ etapa: 'LISTO' });
    await como(pepe.token).post(`/repartos/${id}/salir`);
    expect((await como(pepe.token).post('/repartos/ubicacion').send(punto)).body).toEqual({
      compartiendo: true,
    });
    expect((await seguir()).repartidor).toMatchObject(punto);

    // Ubicación vieja (más de 10 min): no se muestra.
    await prisma.usuario.update({
      where: { id: pepe.id },
      data: { ubicacionEn: new Date(Date.now() - 11 * 60_000) },
    });
    expect((await seguir()).repartidor).toBeNull();

    await como(pepe.token).post('/repartos/ubicacion').send(punto);
    await como(pepe.token).post(`/repartos/${id}/entregar`).send({ metodoPago: 'EFECTIVO' });
    expect((await seguir()).repartidor).toBeNull();
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: pepe.id } });
    expect(u).toMatchObject({ latActual: null, lngActual: null, ubicacionEn: null });

    // Valida el punto y solo el repartidor la puede mandar.
    expect(
      (await como(pepe.token).post('/repartos/ubicacion').send({ lat: 200, lng: 0 })).status,
    ).toBe(400);
    expect((await como(caja).post('/repartos/ubicacion').send(punto)).status).toBe(403);
  });
});
