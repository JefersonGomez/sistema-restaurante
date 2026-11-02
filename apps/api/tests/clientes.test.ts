import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ClienteFila,
  ClientePerfil,
  CuentaDetalle,
  SeguimientoEnLinea,
} from '@menu-qr/shared';
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
let dueno: string;

const base = '/public/resto-a/clientes';
const como = (t: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
});
const conCliente = (t: string) => ({
  get: (u: string) => request(app).get(u).set('X-Cliente', t),
  put: (u: string) => request(app).put(u).set('X-Cliente', t),
  post: (u: string) => request(app).post(u).set('X-Cliente', t),
});
const registrar = (extra: object = {}) =>
  request(app)
    .post(`${base}/registro`)
    .send({
      nombre: 'Ana',
      telefono: '8888 1234',
      email: 'ana@correo.test',
      password: 'secreta123',
      ...extra,
    });
const pedir = (telefono = '8888 1234', tokenCliente?: string) => {
  const r = request(app)
    .post('/public/resto-a/pedidos-en-linea')
    .send({
      clientRequestId: nuevoRequestId(),
      tipo: 'RECOGER',
      cliente: { nombre: 'Ana', telefono },
      pago: { metodo: 'EFECTIVO' },
      items: [{ platoId: m.refresco, cantidad: 1 }],
    });
  return tokenCliente ? r.set('X-Cliente', tokenCliente) : r;
};
const seguir = async (token: string) =>
  (await request(app).get(`/public/seguimiento/${token}`)).body as SeguimientoEnLinea;
// Pide, acepta, marca listo y entrega: un sello. Devuelve el token de seguimiento.
const entregado = async (telefono = '8888 1234') => {
  const token = (await pedir(telefono)).body.token as string;
  const s = await seguir(token);
  await como(caja).post(`/enlinea/${s.cuenta.id}/aceptar`).send({ tiempoEstimadoMin: 15 });
  await como(caja).post(`/enlinea/${s.cuenta.id}/etapa`).send({ etapa: 'LISTO' });
  await como(caja).post(`/enlinea/${s.cuenta.id}/entregar`).send({ metodoPago: 'EFECTIVO' });
  return token;
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
    data: { enLineaActivo: true, enLineaRecoger: true },
  });
  await crearUsuario('caja@resto-a.test', 'CAJA', restauranteId);
  caja = await tokenDe('caja@resto-a.test');
  dueno = await tokenDe('dueno@resto-a.test');
});

describe('cuenta del cliente', () => {
  it('registro, entrar, perfil y sesión que solo vale en su restaurante', async () => {
    const r = await registrar();
    expect(r.status).toBe(201);
    expect(r.body.cliente).toMatchObject({ nombre: 'Ana', email: 'ana@correo.test' });
    expect((await registrar()).body.error.code).toBe('CORREO_EN_USO');

    const mala = await request(app)
      .post(`${base}/entrar`)
      .send({ email: 'ana@correo.test', password: 'otra-cosa' });
    expect(mala.status).toBe(401);
    const inexistente = await request(app)
      .post(`${base}/entrar`)
      .send({ email: 'nadie@correo.test', password: 'secreta123' });
    expect(inexistente.body.error).toEqual(mala.body.error); // no revela qué correos existen

    const ok = await request(app)
      .post(`${base}/entrar`)
      .send({ email: 'ANA@correo.test', password: 'secreta123' });
    expect(ok.status).toBe(200);
    expect((await conCliente(ok.body.token).get(`${base}/yo`)).body.email).toBe('ana@correo.test');

    // La sesión no sirve en otro restaurante ni sin token.
    await crearRestaurante('resto-b');
    expect((await conCliente(ok.body.token).get('/public/resto-b/clientes/yo')).status).toBe(401);
    expect((await request(app).get(`${base}/yo`)).status).toBe(401);
  });

  it('el pedido con sesión queda en su cuenta; el teléfono se reconoce en cualquier formato', async () => {
    const { token } = (await registrar()).body;
    await pedir('8888 1234', token);
    await pedir('+506 8888-1234'); // como invitado, mismo teléfono
    const p = (await conCliente(token).get(`${base}/yo`)).body as ClientePerfil;
    expect(p.pedidos).toHaveLength(2);
    const cuenta = await prisma.cuenta.findFirstOrThrow({ where: { clienteId: p.id } });
    expect(cuenta.telefonoNormal).toBe('88881234');
  });

  it('editar datos, cambiar la contraseña (cierra las otras sesiones) y salir', async () => {
    const { token } = (await registrar()).body;
    const otra = (
      await request(app)
        .post(`${base}/entrar`)
        .send({ email: 'ana@correo.test', password: 'secreta123' })
    ).body.token;

    const editado = await conCliente(token)
      .put(`${base}/yo`)
      .send({
        nombre: 'Ana María',
        telefono: '8777 0000',
        direccion: 'Del parque 100 m sur',
        referencia: null,
        ubicacion: { lat: 9.93, lng: -84.08 },
      });
    expect(editado.body).toMatchObject({
      nombre: 'Ana María',
      direccion: 'Del parque 100 m sur',
      ubicacion: { lat: 9.93, lng: -84.08 },
    });

    const cambio = (actual: string) =>
      conCliente(token).post(`${base}/yo/password`).send({ actual, nueva: 'nueva-clave-1' });
    expect((await cambio('equivocada')).body.error.code).toBe('PASSWORD_ACTUAL');
    expect((await cambio('secreta123')).status).toBe(204);
    expect((await conCliente(otra).get(`${base}/yo`)).status).toBe(401);
    expect((await conCliente(token).get(`${base}/yo`)).status).toBe(200);

    expect((await conCliente(token).post(`${base}/salir`)).status).toBe(204);
    expect((await conCliente(token).get(`${base}/yo`)).status).toBe(401);
  });
});

describe('fidelidad y lista de clientes', () => {
  it('cada pedido entregado es un sello; al completar la tarjeta se canjea una vez', async () => {
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { fidelidadActiva: true, sellosMeta: 2, premioFidelidad: 'Un casado gratis' },
    });
    await entregado('8888 1234');
    const token = await entregado('+506 8888-1234');
    expect((await seguir(token)).fidelidad).toEqual({
      sellos: 2,
      meta: 2,
      premio: 'Un casado gratis',
    });

    // En "En línea" la tarjeta trae los sellos del cliente.
    const lista = (await como(caja).get('/enlinea')).body as CuentaDetalle[];
    expect(lista[0]!.enLinea!.fidelidad).toMatchObject({ sellos: 2, meta: 2 });

    const canje = await como(caja).post('/clientes/canjear').send({ telefono: '88881234' });
    expect(canje.body).toEqual({ sellos: 0, meta: 2, premio: 'Un casado gratis' });
    expect(
      (await como(caja).post('/clientes/canjear').send({ telefono: '88881234' })).body.error.code,
    ).toBe('SELLOS_INSUFICIENTES');

    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { fidelidadActiva: false },
    });
    expect(
      (await como(caja).post('/clientes/canjear').send({ telefono: '88881234' })).body.error.code,
    ).toBe('FIDELIDAD_INACTIVA');
  });

  it('lista de clientes por teléfono: pedidos, gastado, frecuente, cuenta y búsqueda', async () => {
    await registrar();
    for (let i = 0; i < 3; i++) await entregado('8888 1234');
    await entregado('8111 2222');
    await pedir('8333 4444'); // sin entregar todavía

    const filas = (await como(dueno).get('/clientes')).body as ClienteFila[];
    expect(filas.map((f) => f.telefono)).toEqual(['88881234', '81112222', '83334444']);
    expect(filas[0]).toMatchObject({ pedidos: 3, frecuente: true, registrado: true, sellos: null });
    expect(filas[0]!.gastado).toBeGreaterThan(0);
    expect(filas[1]).toMatchObject({ pedidos: 1, frecuente: false, registrado: false });
    expect(filas[2]).toMatchObject({ pedidos: 0, gastado: 0 });

    expect((await como(dueno).get('/clientes?buscar=8111')).body).toHaveLength(1);
    expect((await como(dueno).get('/clientes?buscar=ana')).body).toHaveLength(3);
    expect((await como(caja).get('/clientes')).status).toBe(403);
  });
});
