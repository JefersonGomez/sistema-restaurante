import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { calcularTotales, type CuentaDetalle, type SeguimientoEnLinea } from '@menu-qr/shared';
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
const config = { porcentajeIva: 13, porcentajeServicio: 10, preciosIncluyenImpuestos: true };

const pedir = (extra: object = {}, slug = 'resto-a') =>
  request(app)
    .post(`/public/${slug}/pedidos-en-linea`)
    .send({
      clientRequestId: nuevoRequestId(),
      tipo: 'RECOGER',
      cliente: { nombre: 'Ana', telefono: '8888 1234' },
      pago: { metodo: 'EFECTIVO' },
      items: [{ platoId: m.refresco, cantidad: 2 }],
      ...extra,
    });
const seguir = async (token: string) =>
  (await request(app).get(`/public/seguimiento/${token}`)).body as SeguimientoEnLinea;
const comoCaja = (t = caja) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
});

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
    data: {
      ...config,
      enLineaActivo: true,
      enLineaRecoger: true,
      enLineaDomicilio: true,
      costoEnvio: 100000,
      modoConfirmacion: 'NUNCA', // aun así, en línea siempre lo acepta el restaurante
    },
  });
  await crearUsuario('caja@resto-a.test', 'CAJA', restauranteId);
  await crearUsuario('cocina@resto-a.test', 'COCINA', restauranteId);
  caja = await tokenDe('caja@resto-a.test');
});

describe('pedidos en línea', () => {
  it('para recoger: llega como "por aceptar", no entra a cocina hasta aceptarlo y se cobra sin servicio', async () => {
    const r = await pedir();
    expect(r.status).toBe(201);
    let s = await seguir(r.body.token);
    expect(s.cuenta).toMatchObject({ tipo: 'RECOGER', lugar: 'Para llevar #1 · Ana', mesa: null });
    expect(s.cuenta.enLinea).toMatchObject({ etapa: 'RECIBIDO', clienteTelefono: '8888 1234' });
    expect(s.cuenta.total).toBeGreaterThan(0); // el total se conoce desde que se pide

    // Ni cocina ni la bandeja del mesero lo ven todavía; caja sí, en "En línea".
    const cocina = await tokenDe('cocina@resto-a.test');
    const bar = await request(app)
      .get(`/operacion/estaciones/${m.estaciones.bar}/items`)
      .set('Authorization', `Bearer ${cocina}`);
    expect(bar.body).toEqual([]);
    expect((await comoCaja().get('/enlinea')).body.map((c: CuentaDetalle) => c.id)).toEqual([
      s.cuenta.id,
    ]);

    const acepto = await comoCaja()
      .post(`/enlinea/${s.cuenta.id}/aceptar`)
      .send({ tiempoEstimadoMin: 20 });
    expect(acepto.body.enLinea).toMatchObject({ etapa: 'ACEPTADO', tiempoEstimadoMin: 20 });
    const enBar = await request(app)
      .get(`/operacion/estaciones/${m.estaciones.bar}/items`)
      .set('Authorization', `Bearer ${cocina}`);
    expect(enBar.body[0]).toMatchObject({ lugar: 'Para llevar #1 · Ana', mesa: null });

    // "Salió a entregar" es solo para domicilio.
    expect(
      (await comoCaja().post(`/enlinea/${s.cuenta.id}/etapa`).send({ etapa: 'EN_CAMINO' })).status,
    ).toBe(409);
    await comoCaja().post(`/enlinea/${s.cuenta.id}/etapa`).send({ etapa: 'LISTO' });
    const fin = await comoCaja()
      .post(`/enlinea/${s.cuenta.id}/entregar`)
      .send({ metodoPago: 'EFECTIVO' });
    expect(fin.body).toMatchObject({ estado: 'CERRADA', metodoPago: 'EFECTIVO' });
    const esperado = calcularTotales([{ precioUnitario: 150000, cantidad: 2 }], {
      ...config,
      porcentajeServicio: 0,
    });
    expect(fin.body).toMatchObject({ ...esperado, montoServicio: 0 });
    s = await seguir(r.body.token);
    expect(s.cuenta.enLinea?.etapa).toBe('ENTREGADO');
  });

  it('a domicilio: pide dirección, suma el envío y puede salir a entregar', async () => {
    expect((await pedir({ tipo: 'DOMICILIO' })).status).toBe(400); // sin dirección
    const r = await pedir({
      tipo: 'DOMICILIO',
      cliente: { nombre: 'Luis', telefono: '8777 0000', direccion: 'Barrio Escalante, casa 12' },
      pago: { metodo: 'SINPE', comprobante: '123456' },
    });
    const { cuenta } = await seguir(r.body.token);
    expect(cuenta.enLinea).toMatchObject({
      costoEnvio: 100000,
      pagoElegido: 'SINPE',
      comprobanteSinpe: '123456',
      direccion: 'Barrio Escalante, casa 12',
    });
    await comoCaja().post(`/enlinea/${cuenta.id}/aceptar`).send({ tiempoEstimadoMin: 40 });
    await comoCaja().post(`/enlinea/${cuenta.id}/pago-verificado`);
    await comoCaja().post(`/enlinea/${cuenta.id}/etapa`).send({ etapa: 'LISTO' });
    expect(
      (await comoCaja().post(`/enlinea/${cuenta.id}/etapa`).send({ etapa: 'EN_CAMINO' })).body
        .enLinea,
    ).toMatchObject({ etapa: 'EN_CAMINO', pagoVerificado: true });
    const fin = await comoCaja()
      .post(`/enlinea/${cuenta.id}/entregar`)
      .send({ metodoPago: 'SINPE' });
    const sinEnvio = calcularTotales([{ precioUnitario: 150000, cantidad: 2 }], {
      ...config,
      porcentajeServicio: 0,
    });
    expect(fin.body.total).toBe(sinEnvio.total + 100000);
  });

  it('rechazar con motivo: el cliente lo ve y ya no se puede aceptar', async () => {
    const r = await pedir();
    const { cuenta } = await seguir(r.body.token);
    await comoCaja().post(`/enlinea/${cuenta.id}/rechazar`).send({ motivo: 'No hay gas' });
    const s = await seguir(r.body.token);
    expect(s.cuenta.enLinea).toMatchObject({ etapa: 'RECHAZADO', motivoRechazo: 'No hay gas' });
    expect(s.cuenta.estado).toBe('CERRADA');
    expect(
      (await comoCaja().post(`/enlinea/${cuenta.id}/aceptar`).send({ tiempoEstimadoMin: 10 }))
        .status,
    ).toBe(409);
  });

  it('reglas: activo, tipo habilitado, horario, mínimo, idempotencia y límite por teléfono', async () => {
    const actualizar = (data: object) =>
      prisma.restaurante.update({ where: { id: restauranteId }, data });

    await actualizar({ enLineaDomicilio: false });
    expect(
      (
        await pedir({
          tipo: 'DOMICILIO',
          cliente: { nombre: 'X', telefono: '8888 0000', direccion: 'Calle 1, casa 2' },
        })
      ).body.error.code,
    ).toBe('TIPO_NO_DISPONIBLE');

    await actualizar({ pedidoMinimo: 1000000 });
    const minimo = await pedir();
    expect(minimo.body.error.code).toBe('PEDIDO_MINIMO');
    expect(await prisma.cuenta.count({ where: { restauranteId } })).toBe(0); // no quedó nada
    await actualizar({ pedidoMinimo: 0 });

    const id = nuevoRequestId();
    const a = await pedir({ clientRequestId: id });
    const b = await pedir({ clientRequestId: id });
    expect(b.body.token).toBe(a.body.token);
    await pedir(); // segundo pendiente del mismo teléfono
    expect((await pedir()).status).toBe(429);

    await actualizar({ cerradoManual: true });
    expect((await pedir({ cliente: { nombre: 'Y', telefono: '8111 2222' } })).status).toBe(423);
    await actualizar({ cerradoManual: false, enLineaActivo: false });
    expect((await pedir({ cliente: { nombre: 'Y', telefono: '8111 2222' } })).body.error.code).toBe(
      'EN_LINEA_INACTIVO',
    );
  });

  it('aislamiento: otro restaurante no ve ni responde estos pedidos; el token inventado no sirve', async () => {
    const r = await pedir();
    const { cuenta } = await seguir(r.body.token);
    const { restaurante: b } = await crearRestaurante('resto-b');
    await crearUsuario('caja@resto-b.test', 'CAJA', b.id);
    const ajena = await tokenDe('caja@resto-b.test');
    expect((await comoCaja(ajena).get('/enlinea')).body).toEqual([]);
    expect(
      (await comoCaja(ajena).post(`/enlinea/${cuenta.id}/aceptar`).send({ tiempoEstimadoMin: 10 }))
        .status,
    ).toBe(404);
    expect((await request(app).get(`/public/seguimiento/${'x'.repeat(32)}`)).status).toBe(404);
  });
});

describe('enlace y QR para compartir', () => {
  it('el dueño ve el enlace /r/:slug y descarga su QR en PNG', async () => {
    const dueno = await tokenDe('dueno@resto-a.test');
    const r = await request(app).get('/restaurante').set('Authorization', `Bearer ${dueno}`);
    expect(r.body.enlaceEnLinea).toMatch(/\/r\/resto-a$/);
    const qr = await request(app)
      .get('/restaurante/qr-enlinea.png')
      .set('Authorization', `Bearer ${dueno}`)
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toMatch('image/png');
    expect((qr.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
    expect(
      (await request(app).get('/restaurante/qr-enlinea.png').set('Authorization', `Bearer ${caja}`))
        .status,
    ).toBe(403);
  });
});
