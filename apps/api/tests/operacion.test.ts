import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  abrirSesion,
  crearRestaurante,
  crearUsuario,
  limpiarBD,
  nuevoRequestId,
  sembrarMenu,
  tokenDe,
} from './helpers';

let m: Awaited<ReturnType<typeof sembrarMenu>>;
let restauranteId: string;
const t: Record<'dueno' | 'mesero' | 'cocina' | 'bar' | 'caja', string> = {} as never;

const como = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
});

const casado = () => ({ platoId: m.casado, cantidad: 1, modificadores: [m.termino[0]] });

// Pedido del comensal en la mesa 1 (modo SIEMPRE: queda PENDIENTE).
async function pedidoPendiente(items: object[] = [casado()]) {
  const s = await abrirSesion(m.mesa.tokenQr);
  const res = await request(app)
    .post('/public/cuenta/pedidos')
    .set('Authorization', `Bearer ${s.token}`)
    .send({ clientRequestId: nuevoRequestId(), items });
  return { sesion: s, pedido: res.body };
}

beforeEach(async () => {
  await limpiarBD();
  const r = await crearRestaurante('resto-a');
  restauranteId = r.restaurante.id;
  m = await sembrarMenu(restauranteId);
  await prisma.restaurante.update({
    where: { id: restauranteId },
    data: { modoConfirmacion: 'SIEMPRE' },
  });
  await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteId);
  await crearUsuario('cocina@resto-a.test', 'COCINA', restauranteId);
  const bar = await crearUsuario('bar@resto-a.test', 'COCINA', restauranteId);
  await prisma.usuario.update({ where: { id: bar.id }, data: { estacionId: m.estaciones.bar } });
  await crearUsuario('caja@resto-a.test', 'CAJA', restauranteId);
  t.dueno = await tokenDe('dueno@resto-a.test');
  t.mesero = await tokenDe('mesero@resto-a.test');
  t.cocina = await tokenDe('cocina@resto-a.test');
  t.bar = await tokenDe('bar@resto-a.test');
  t.caja = await tokenDe('caja@resto-a.test');
});

describe('flujo completo', () => {
  it('comensal pide → mesero confirma → cocina prepara → mesero entrega → caja cierra', async () => {
    const { sesion, pedido } = await pedidoPendiente([
      casado(),
      { platoId: m.refresco, cantidad: 2 },
    ]);
    expect(pedido.estado).toBe('PENDIENTE');

    const pendientes = await como(t.mesero).get('/operacion/pedidos?estado=PENDIENTE');
    expect(pendientes.body.map((p: { id: string }) => p.id)).toEqual([pedido.id]);
    expect((await como(t.mesero).get('/operacion/mesas')).body[0].estado).toBe('PEDIDO_PENDIENTE');

    // Antes de confirmar, la cocina no ve nada.
    expect(
      (await como(t.cocina).get(`/operacion/estaciones/${m.estaciones.cocina}/items`)).body,
    ).toEqual([]);
    expect((await como(t.mesero).patch(`/operacion/pedidos/${pedido.id}/confirmar`)).status).toBe(
      200,
    );

    const enCocina = (
      await como(t.cocina).get(`/operacion/estaciones/${m.estaciones.cocina}/items`)
    ).body;
    expect(enCocina).toHaveLength(1);
    expect(enCocina[0].mesa.numero).toBe(1);
    expect(enCocina[0].items.map((i: { nombreEs: string }) => i.nombreEs)).toEqual(['Casado']);
    const enBar = (await como(t.bar).get(`/operacion/estaciones/${m.estaciones.bar}/items`)).body;
    expect(enBar[0].items.map((i: { nombreEs: string }) => i.nombreEs)).toEqual(['Refresco']);

    const itemCasado = enCocina[0].items[0].id;
    const estado = (token: string, id: string, e: string) =>
      como(token).patch(`/operacion/items/${id}/estado`).send({ estado: e });
    expect((await estado(t.cocina, itemCasado, 'EN_PREPARACION')).status).toBe(200);
    expect((await estado(t.cocina, itemCasado, 'LISTO')).status).toBe(200);

    // Deshacer un toque equivocado: vuelve a EN_PREPARACION y borra la hora de "listo".
    const deshacer = (token: string) =>
      como(token).post(`/operacion/items/${itemCasado}/deshacer`).send({ estado: 'LISTO' });
    expect((await deshacer(t.bar)).status).toBe(403); // otra estación
    expect((await deshacer(t.cocina)).body.estado).toBe('EN_PREPARACION');
    expect((await prisma.pedidoItem.findUnique({ where: { id: itemCasado } }))?.listoEn).toBeNull();
    expect((await deshacer(t.cocina)).status).toBe(409); // ya no está LISTO
    expect((await estado(t.cocina, itemCasado, 'LISTO')).status).toBe(200);
    // Pasado el margen ya no se puede.
    await prisma.pedidoItem.update({
      where: { id: itemCasado },
      data: { listoEn: new Date(Date.now() - 60_000) },
    });
    expect((await deshacer(t.cocina)).status).toBe(409);

    const listos = (await como(t.mesero).get('/operacion/items?estado=LISTO')).body;
    expect(listos.map((i: { id: string }) => i.id)).toEqual([itemCasado]);
    expect((await estado(t.mesero, itemCasado, 'ENTREGADO')).body.estado).toBe('ENTREGADO');

    // Caja: menú ₡7 800 con IVA incluido; el servicio (10 % de la base) se suma
    const solicitud = await request(app)
      .post('/public/cuenta/solicitar')
      .set('Authorization', `Bearer ${sesion.token}`);
    expect(solicitud.body.estado).toBe('PIDIO_CUENTA');
    const cuenta = (await como(t.caja).get(`/operacion/cuentas/${sesion.cuentaId}`)).body;
    expect(cuenta).toMatchObject({
      total: 849027,
      subtotal: 690265,
      montoServicio: 69027,
      montoIva: 89735,
    });

    const cierre = await como(t.caja)
      .post(`/operacion/cuentas/${sesion.cuentaId}/cerrar`)
      .send({ metodoPago: 'SINPE' });
    expect(cierre.body).toMatchObject({ estado: 'CERRADA', metodoPago: 'SINPE', total: 849027 });

    // La sesión del comensal deja de servir y la mesa queda libre.
    expect(
      (await request(app).get('/public/cuenta').set('Authorization', `Bearer ${sesion.token}`))
        .status,
    ).toBe(410);
    const mesa = (await como(t.mesero).get('/operacion/mesas')).body.find(
      (x: { numero: number }) => x.numero === 1,
    );
    expect(mesa).toMatchObject({ estado: 'LIBRE', cuenta: null, llamadasActivas: 0 });
    // Al volver a escanear se abre una cuenta nueva.
    expect((await abrirSesion(m.mesa.tokenQr)).cuentaId).not.toBe(sesion.cuentaId);
  });

  it('el mesero toma un pedido para una mesa: se confirma solo', async () => {
    const res = await como(t.mesero)
      .post(`/operacion/mesas/${m.mesa2.id}/pedidos`)
      .send({ clientRequestId: nuevoRequestId(), items: [casado()] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ estado: 'CONFIRMADO', origen: 'MESERO' });
    const p = await prisma.pedido.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { cuenta: true },
    });
    expect(p.creadoPorUsuarioId).not.toBeNull();
    expect(p.cuenta.verificada).toBe(true);
  });

  it('cancelar ítem con motivo descuenta del total; cancelar pedido pendiente', async () => {
    const { sesion, pedido } = await pedidoPendiente([
      casado(),
      { platoId: m.refresco, cantidad: 1 },
    ]);
    await como(t.mesero).patch(`/operacion/pedidos/${pedido.id}/confirmar`);
    const refresco = pedido.items.find((i: { nombreEs: string }) => i.nombreEs === 'Refresco').id;
    expect(
      (await como(t.mesero).patch(`/operacion/items/${refresco}/cancelar`).send({})).status,
    ).toBe(400);
    const cancelado = await como(t.mesero)
      .patch(`/operacion/items/${refresco}/cancelar`)
      .send({ motivo: 'Se acabó el hielo' });
    expect(cancelado.body).toMatchObject({
      cancelado: true,
      motivoCancelacion: 'Se acabó el hielo',
    });
    expect((await prisma.cuenta.findUniqueOrThrow({ where: { id: sesion.cuentaId } })).total).toBe(
      522478,
    );

    const otro = await pedidoPendiente();
    const res = await como(t.mesero)
      .patch(`/operacion/pedidos/${otro.pedido.id}/cancelar`)
      .send({ motivo: 'Duplicado' });
    expect(res.body.estado).toBe('CANCELADO');
  });

  it('no se puede cerrar con pedidos pendientes', async () => {
    const { sesion } = await pedidoPendiente();
    const res = await como(t.caja)
      .post(`/operacion/cuentas/${sesion.cuentaId}/cerrar`)
      .send({ metodoPago: 'EFECTIVO' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PEDIDOS_PENDIENTES');
  });

  it('llamadas: el mesero las ve y las atiende una sola vez', async () => {
    const s = await abrirSesion(m.mesa.tokenQr);
    await request(app)
      .post('/public/cuenta/llamar')
      .set('Authorization', `Bearer ${s.token}`)
      .send({ tipo: 'MESERO' });
    const lista = (await como(t.mesero).get('/operacion/llamadas?atendida=false')).body;
    expect(lista).toHaveLength(1);
    expect((await como(t.mesero).get('/operacion/mesas')).body[0].estado).toBe('LLAMADA');
    expect((await como(t.mesero).patch(`/operacion/llamadas/${lista[0].id}/atender`)).status).toBe(
      200,
    );
    expect((await como(t.mesero).patch(`/operacion/llamadas/${lista[0].id}/atender`)).status).toBe(
      409,
    );
  });
});

describe('transiciones inválidas → 409', () => {
  it('pedido, ítem y cuenta', async () => {
    const { sesion, pedido } = await pedidoPendiente();
    const item = pedido.items[0].id;
    const estado = (e: string) =>
      como(t.dueno).patch(`/operacion/items/${item}/estado`).send({ estado: e });

    // Ítem de un pedido sin confirmar no avanza.
    expect((await estado('EN_PREPARACION')).status).toBe(409);
    await como(t.dueno).patch(`/operacion/pedidos/${pedido.id}/confirmar`);
    // Confirmar dos veces / cancelar un confirmado.
    expect((await como(t.dueno).patch(`/operacion/pedidos/${pedido.id}/confirmar`)).status).toBe(
      409,
    );
    expect(
      (await como(t.dueno).patch(`/operacion/pedidos/${pedido.id}/cancelar`).send({ motivo: 'x' }))
        .status,
    ).toBe(409);
    // Saltar estados o retroceder.
    expect((await estado('LISTO')).status).toBe(409);
    expect((await estado('ENTREGADO')).status).toBe(409);
    expect((await estado('EN_PREPARACION')).status).toBe(200);
    expect((await estado('EN_PREPARACION')).status).toBe(409);
    expect((await estado('LISTO')).status).toBe(200);
    // Un ítem LISTO ya no se cancela.
    expect(
      (await como(t.dueno).patch(`/operacion/items/${item}/cancelar`).send({ motivo: 'x' })).status,
    ).toBe(409);
    // Estado que no existe → 400.
    expect((await estado('PENDIENTE')).status).toBe(400);

    await como(t.caja)
      .post(`/operacion/cuentas/${sesion.cuentaId}/cerrar`)
      .send({ metodoPago: 'TARJETA' });
    expect(
      (
        await como(t.caja)
          .post(`/operacion/cuentas/${sesion.cuentaId}/cerrar`)
          .send({ metodoPago: 'TARJETA' })
      ).status,
    ).toBe(409);
    expect((await estado('ENTREGADO')).status).toBe(409);
  });
});

describe('permisos por rol en /operacion', () => {
  it('cada rol solo hace lo suyo', async () => {
    const { sesion, pedido } = await pedidoPendiente();
    const item = pedido.items[0].id;

    expect((await request(app).get('/operacion/mesas')).status).toBe(401);
    // Cocina no confirma ni ve mesas; caja no confirma; mesero no cierra.
    expect((await como(t.cocina).patch(`/operacion/pedidos/${pedido.id}/confirmar`)).status).toBe(
      403,
    );
    expect((await como(t.cocina).get('/operacion/mesas')).status).toBe(403);
    expect((await como(t.caja).patch(`/operacion/pedidos/${pedido.id}/confirmar`)).status).toBe(
      403,
    );
    expect(
      (
        await como(t.mesero)
          .post(`/operacion/cuentas/${sesion.cuentaId}/cerrar`)
          .send({ metodoPago: 'EFECTIVO' })
      ).status,
    ).toBe(403);
    expect(
      (await como(t.mesero).get(`/operacion/estaciones/${m.estaciones.cocina}/items`)).status,
    ).toBe(403);
    expect((await como(t.caja).get(`/operacion/cuentas/${sesion.cuentaId}`)).status).toBe(200);
    expect((await como(t.mesero).get('/reportes/hoy')).status).toBe(403);

    await como(t.mesero).patch(`/operacion/pedidos/${pedido.id}/confirmar`);
    const estado = (token: string, e: string) =>
      como(token).patch(`/operacion/items/${item}/estado`).send({ estado: e });
    // Mesero no prepara; caja no toca ítems; bar no toca ítems de cocina.
    expect((await estado(t.mesero, 'EN_PREPARACION')).status).toBe(403);
    expect((await estado(t.caja, 'EN_PREPARACION')).status).toBe(403);
    expect((await estado(t.bar, 'EN_PREPARACION')).status).toBe(403);
    expect(
      (await como(t.bar).get(`/operacion/estaciones/${m.estaciones.cocina}/items`)).status,
    ).toBe(403);
    expect(
      (await como(t.bar).get('/operacion/estaciones')).body.map(
        (e: { nombre: string }) => e.nombre,
      ),
    ).toEqual(['Bar']);
    expect((await estado(t.cocina, 'EN_PREPARACION')).status).toBe(200);
    expect((await estado(t.cocina, 'LISTO')).status).toBe(200);
    // Cocina también entrega en la barra (Fase 10); la caja no.
    expect((await estado(t.caja, 'ENTREGADO')).status).toBe(403);
    expect((await estado(t.cocina, 'ENTREGADO')).status).toBe(200);
  });
});

describe('cocina: varios platos de un pedido a la vez', () => {
  it('Empezar, marcar todo listo y entregar; el bar solo mueve lo suyo', async () => {
    const { pedido } = await pedidoPendiente([casado(), { platoId: m.refresco, cantidad: 2 }]);
    await como(t.mesero).patch(`/operacion/pedidos/${pedido.id}/confirmar`);
    const avanzar = (token: string, body: object) =>
      como(token).post(`/operacion/pedidos/${pedido.id}/avanzar`).send(body);
    const estados = async () =>
      (
        await prisma.pedidoItem.findMany({
          where: { pedidoId: pedido.id },
          select: { estado: true, platoId: true },
        })
      )
        .sort((a) => (a.platoId === m.casado ? -1 : 1)) // [casado, refresco]
        .map((i) => i.estado);

    // El usuario de bar solo mueve el refresco.
    expect((await avanzar(t.bar, { estado: 'EN_PREPARACION' })).body).toEqual({ movidos: 1 });
    expect(await estados()).toEqual(['PENDIENTE', 'EN_PREPARACION']);

    // De PENDIENTE a LISTO en una llamada (pasa por EN_PREPARACION) y queda la hora de listo.
    expect((await avanzar(t.cocina, { estado: 'LISTO' })).body).toEqual({ movidos: 2 });
    expect(await estados()).toEqual(['LISTO', 'LISTO']);
    const items = await como(t.cocina).get(`/operacion/estaciones/${m.estaciones.cocina}/items`);
    expect(items.body[0]).toMatchObject({
      canal: 'MESA',
      numero: null,
      atendio: expect.any(String),
    });
    expect(items.body[0].items[0].listoEn).not.toBeNull();

    // Solo los platos indicados; el mesero no prepara pero sí entrega.
    expect((await avanzar(t.mesero, { estado: 'LISTO' })).status).toBe(403);
    const primero = await prisma.pedidoItem.findFirst({
      where: { pedidoId: pedido.id, platoId: m.casado },
    });
    expect((await avanzar(t.cocina, { estado: 'ENTREGADO', itemIds: [primero!.id] })).body).toEqual(
      { movidos: 1 },
    );
    expect(await estados()).toEqual(['ENTREGADO', 'LISTO']);
    expect((await avanzar(t.mesero, { estado: 'ENTREGADO' })).body).toEqual({ movidos: 1 });
  });

  it('"Listo · avisar mesero": solo con todo listo, una vez, y lo ve la pantalla de cocina', async () => {
    const { pedido } = await pedidoPendiente([casado()]);
    await como(t.mesero).patch(`/operacion/pedidos/${pedido.id}/confirmar`);
    const avisarListo = (token: string) =>
      como(token).post(`/operacion/pedidos/${pedido.id}/avisar-listo`);

    expect((await avisarListo(t.cocina)).body.error.code).toBe('TRANSICION_INVALIDA');
    await como(t.cocina).post(`/operacion/pedidos/${pedido.id}/avanzar`).send({ estado: 'LISTO' });
    expect((await avisarListo(t.mesero)).status).toBe(403);
    const primero = await avisarListo(t.cocina);
    expect(primero.status).toBe(200);
    // Repetirlo no corre la hora del aviso.
    await avisarListo(t.cocina);
    const [enCocina] = (
      await como(t.cocina).get(`/operacion/estaciones/${m.estaciones.cocina}/items`)
    ).body;
    expect(enCocina.listoAvisadoEn).toBe(primero.body.listoAvisadoEn);
  });
});

describe('aislamiento entre restaurantes', () => {
  it('el personal de A no ve ni modifica pedidos o cuentas de B', async () => {
    const b = await crearRestaurante('resto-b');
    const mb = await sembrarMenu(b.restaurante.id);
    await prisma.restaurante.update({
      where: { id: b.restaurante.id },
      data: { modoConfirmacion: 'SIEMPRE' },
    });
    const sb = await abrirSesion(mb.mesa.tokenQr);
    const pb = (
      await request(app)
        .post('/public/cuenta/pedidos')
        .set('Authorization', `Bearer ${sb.token}`)
        .send({ clientRequestId: nuevoRequestId(), items: [{ platoId: mb.refresco, cantidad: 1 }] })
    ).body;
    const itemB = pb.items[0].id;

    const a = como(t.dueno);
    expect((await a.get('/operacion/pedidos')).body).toEqual([]);
    expect((await a.get(`/operacion/cuentas/${sb.cuentaId}`)).status).toBe(404);
    expect((await a.patch(`/operacion/pedidos/${pb.id}/confirmar`)).status).toBe(404);
    expect(
      (await a.patch(`/operacion/pedidos/${pb.id}/cancelar`).send({ motivo: 'x' })).status,
    ).toBe(404);
    expect(
      (await a.patch(`/operacion/items/${itemB}/estado`).send({ estado: 'EN_PREPARACION' })).status,
    ).toBe(404);
    expect((await a.patch(`/operacion/items/${itemB}/cancelar`).send({ motivo: 'x' })).status).toBe(
      404,
    );
    expect(
      (await a.post(`/operacion/cuentas/${sb.cuentaId}/cerrar`).send({ metodoPago: 'EFECTIVO' }))
        .status,
    ).toBe(404);
    expect((await a.get(`/operacion/estaciones/${mb.estaciones.bar}/items`)).status).toBe(404);
    expect(
      (
        await a
          .post(`/operacion/mesas/${mb.mesa.id}/pedidos`)
          .send({ clientRequestId: nuevoRequestId(), items: [casado()] })
      ).status,
    ).toBe(404);
    expect((await a.get('/operacion/mesas')).body.map((x: { id: string }) => x.id)).not.toContain(
      mb.mesa.id,
    );

    const intacto = await prisma.pedido.findUniqueOrThrow({ where: { id: pb.id } });
    expect(intacto.estado).toBe('PENDIENTE');
  });
});

describe('reportes/hoy', () => {
  it('suma las cuentas cerradas de hoy', async () => {
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { modoConfirmacion: 'NUNCA' },
    });
    const s = await abrirSesion(m.mesa.tokenQr);
    await request(app)
      .post('/public/cuenta/pedidos')
      .set('Authorization', `Bearer ${s.token}`)
      .send({
        clientRequestId: nuevoRequestId(),
        items: [
          { ...casado(), cantidad: 2 },
          { platoId: m.refresco, cantidad: 1 },
        ],
      });
    await como(t.caja)
      .post(`/operacion/cuentas/${s.cuentaId}/cerrar`)
      .send({ metodoPago: 'EFECTIVO' });

    const r = (await como(t.dueno).get('/reportes/hoy')).body;
    expect(r).toMatchObject({ totalVendido: 1208230, cuentasCerradas: 1, ticketPromedio: 1208230 });
    expect(r.topPlatos[0]).toMatchObject({ nombreEs: 'Casado', cantidad: 2 });
  });
});
