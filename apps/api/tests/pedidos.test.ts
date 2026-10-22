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
let sesion: { token: string; cuentaId: string };

const pedir = (token: string, body: object) =>
  request(app).post('/public/cuenta/pedidos').set('Authorization', `Bearer ${token}`).send(body);

// Un casado válido: término obligatorio elegido.
const casado = (extra: object = {}) => ({
  platoId: m.casado,
  cantidad: 1,
  modificadores: [m.termino[0]],
  ...extra,
});
const pedido = (items: object[], extra: object = {}) => ({
  clientRequestId: nuevoRequestId(),
  items,
  ...extra,
});

beforeEach(async () => {
  await limpiarBD();
  const r = await crearRestaurante('resto-a');
  restauranteId = r.restaurante.id;
  m = await sembrarMenu(restauranteId);
  await prisma.restaurante.update({
    where: { id: restauranteId },
    data: { modoConfirmacion: 'NUNCA' },
  });
  sesion = await abrirSesion(m.mesa.tokenQr);
});

describe('sesión del comensal y cuenta', () => {
  it('abre la cuenta y entrega una sesión; el mismo celular la reutiliza', async () => {
    expect(sesion.token.length).toBeGreaterThanOrEqual(40);
    const otraVez = await request(app)
      .get(`/public/mesa/${m.mesa.tokenQr}`)
      .set('Authorization', `Bearer ${sesion.token}`);
    expect(otraVez.body).toMatchObject({
      cuentaId: sesion.cuentaId,
      token: sesion.token,
      numero: 1,
    });
    expect(await prisma.sesionCliente.count()).toBe(1);
    // Solo se guarda el hash.
    expect(await prisma.sesionCliente.count({ where: { tokenHash: sesion.token } })).toBe(0);
  });

  it('dos celulares en la misma mesa comparten la cuenta con sesiones distintas', async () => {
    const otro = await abrirSesion(m.mesa.tokenQr);
    expect(otro.cuentaId).toBe(sesion.cuentaId);
    expect(otro.token).not.toBe(sesion.token);
  });

  it('solo una cuenta abierta por mesa aunque lleguen solicitudes simultáneas', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => request(app).get(`/public/mesa/${m.mesa2.tokenQr}`)),
    );
    expect(respuestas.every((r) => r.status === 200)).toBe(true);
    expect(new Set(respuestas.map((r) => r.body.cuentaId)).size).toBe(1);
    expect(await prisma.cuenta.count({ where: { mesaId: m.mesa2.id } })).toBe(1);
  });

  it('rutas de cuenta sin sesión → 401', async () => {
    expect((await request(app).get('/public/cuenta')).status).toBe(401);
    expect((await pedir('token-inventado', pedido([casado()]))).status).toBe(401);
  });
});

describe('crear pedido', () => {
  it('el servidor calcula el precio (ignora precios del cliente) y los totales', async () => {
    const res = await pedir(
      sesion.token,
      pedido(
        [casado({ modificadores: [m.termino[0], m.extras[0]], cantidad: 2, precioUnitario: 1 })],
        {
          total: 1,
        },
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('CONFIRMADO');
    // 4 800 + 500 de huevo = 5 300 por unidad
    expect(res.body.items[0]).toMatchObject({ precioUnitario: 530000, cantidad: 2 });
    expect(res.body.items[0].modificadores.map((x: { nombre: string }) => x.nombre).sort()).toEqual(
      ['Huevo', 'Medio'],
    );

    const cuenta = await request(app)
      .get('/public/cuenta')
      .set('Authorization', `Bearer ${sesion.token}`);
    // Menú ₡10 600 con IVA incluido; + 10 % de servicio sobre la base
    expect(cuenta.body).toMatchObject({ total: 1153805, mesa: { numero: 1 } });
    expect(cuenta.body.subtotal + cuenta.body.montoServicio + cuenta.body.montoIva).toBe(1153805);
  });

  it('modificadores: obligatorio, máximo y ajenos', async () => {
    const sinObligatorio = await pedir(sesion.token, pedido([casado({ modificadores: [] })]));
    expect(sinObligatorio.status).toBe(400);
    expect(sinObligatorio.body.error.code).toBe('MODIFICADORES_INVALIDOS');

    const dosTerminos = await pedir(sesion.token, pedido([casado({ modificadores: m.termino })]));
    expect(dosTerminos.status).toBe(400);

    const tresExtras = await pedir(
      sesion.token,
      pedido([casado({ modificadores: [m.termino[0], ...m.extras] })]),
    );
    expect(tresExtras.status).toBe(400);
    expect(tresExtras.body.error.details).toMatchObject({ maximo: 2, elegidos: 3 });

    const ajeno = await pedir(
      sesion.token,
      pedido([{ platoId: m.refresco, cantidad: 1, modificadores: [m.extras[0]] }]),
    );
    expect(ajeno.status).toBe(400);

    const dosExtras = await pedir(
      sesion.token,
      pedido([casado({ modificadores: [m.termino[1], m.extras[0], m.extras[1]] })]),
    );
    expect(dosExtras.status).toBe(201);
  });

  it('no se puede pedir un plato agotado, inactivo o de otro restaurante', async () => {
    const b = await crearRestaurante('resto-b');
    const mb = await sembrarMenu(b.restaurante.id);
    for (const platoId of [m.agotado, m.inactivo, mb.refresco]) {
      const res = await pedir(sesion.token, pedido([{ platoId, cantidad: 1 }]));
      expect(res.status, platoId).toBe(409);
      expect(res.body.error.code).toBe('PLATO_NO_DISPONIBLE');
    }
    expect(await prisma.pedido.count()).toBe(0);
  });

  it('límites: cantidad 1–20, notas ≤ 200, máximo 30 ítems', async () => {
    expect((await pedir(sesion.token, pedido([casado({ cantidad: 0 })]))).status).toBe(400);
    expect((await pedir(sesion.token, pedido([casado({ cantidad: 21 })]))).status).toBe(400);
    expect((await pedir(sesion.token, pedido([casado({ notas: 'x'.repeat(201) })]))).status).toBe(
      400,
    );
    const refrescos = (n: number) =>
      Array.from({ length: n }, () => ({ platoId: m.refresco, cantidad: 1 }));
    expect((await pedir(sesion.token, pedido(refrescos(31)))).status).toBe(400);
    expect((await pedir(sesion.token, pedido(refrescos(30)))).status).toBe(201);
  });

  it('idempotencia: el mismo clientRequestId no duplica el pedido (secuencial y simultáneo)', async () => {
    const body = pedido([casado()]);
    const r1 = await pedir(sesion.token, body);
    const r2 = await pedir(sesion.token, body);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);

    const otro = pedido([casado()]);
    const simultaneos = await Promise.all(
      Array.from({ length: 5 }, () => pedir(sesion.token, otro)),
    );
    expect(new Set(simultaneos.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.pedido.count()).toBe(2);
  });

  it('cuenta CERRADA → 410 para pedir y para ver', async () => {
    await prisma.cuenta.update({ where: { id: sesion.cuentaId }, data: { estado: 'CERRADA' } });
    const res = await pedir(sesion.token, pedido([casado()]));
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('CUENTA_CERRADA');
    expect(
      (await request(app).get('/public/cuenta').set('Authorization', `Bearer ${sesion.token}`))
        .status,
    ).toBe(410);
  });

  it('el comensal no ve ni pide en otra cuenta: la cuenta sale de su sesión', async () => {
    const otraMesa = await abrirSesion(m.mesa2.tokenQr);
    await pedir(otraMesa.token, pedido([casado()]));
    // Aunque mande el id de la otra cuenta, se usa la de su sesión.
    const res = await pedir(sesion.token, { ...pedido([casado()]), cuentaId: otraMesa.cuentaId });
    expect(res.status).toBe(201);
    const pedidoCreado = await prisma.pedido.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(pedidoCreado.cuentaId).toBe(sesion.cuentaId);

    const vista = await request(app)
      .get('/public/cuenta')
      .set('Authorization', `Bearer ${sesion.token}`);
    expect(vista.body.id).toBe(sesion.cuentaId);
    expect(vista.body.pedidos).toHaveLength(1);
  });
});

describe('modoConfirmacion', () => {
  const confirmar = async (pedidoId: string) =>
    request(app)
      .patch(`/operacion/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${await tokenDe('mesero@resto-a.test')}`);

  beforeEach(async () => {
    await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteId);
  });

  it('PRIMER_PEDIDO: el primero espera al mesero; tras confirmarlo, los siguientes pasan directo', async () => {
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { modoConfirmacion: 'PRIMER_PEDIDO' },
    });
    const p1 = await pedir(sesion.token, pedido([casado()]));
    expect(p1.body.estado).toBe('PENDIENTE');
    // Pendiente no suma a la cuenta.
    expect((await prisma.cuenta.findUniqueOrThrow({ where: { id: sesion.cuentaId } })).total).toBe(
      0,
    );

    expect((await confirmar(p1.body.id)).status).toBe(200);
    expect((await prisma.cuenta.findUniqueOrThrow({ where: { id: sesion.cuentaId } })).total).toBe(
      522478, // ₡4 800 con IVA + servicio sobre la base
    );

    const p2 = await pedir(sesion.token, pedido([casado()]));
    expect(p2.body.estado).toBe('CONFIRMADO');
  });

  it('SIEMPRE: todos esperan confirmación', async () => {
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { modoConfirmacion: 'SIEMPRE' },
    });
    const p1 = await pedir(sesion.token, pedido([casado()]));
    await confirmar(p1.body.id);
    expect((await pedir(sesion.token, pedido([casado()]))).body.estado).toBe('PENDIENTE');
  });

  it('NUNCA: todo pasa directo', async () => {
    expect((await pedir(sesion.token, pedido([casado()]))).body.estado).toBe('CONFIRMADO');
  });
});

describe('llamar y pedir la cuenta', () => {
  const post = (ruta: string, body?: object) =>
    request(app)
      .post(`/public/cuenta/${ruta}`)
      .set('Authorization', `Bearer ${sesion.token}`)
      .send(body);

  it('llamar al mesero no duplica llamadas sin atender', async () => {
    expect((await post('llamar', { tipo: 'MESERO' })).status).toBe(201);
    await post('llamar', { tipo: 'MESERO' });
    expect(await prisma.llamada.count({ where: { tipo: 'MESERO' } })).toBe(1);
    expect((await post('llamar', { tipo: 'CUENTA' })).status).toBe(400);
  });

  it('pedir la cuenta: ABIERTA → PIDIO_CUENTA con llamada; repetir → 409', async () => {
    const res = await post('solicitar');
    expect(res.body.estado).toBe('PIDIO_CUENTA');
    expect(await prisma.llamada.count({ where: { tipo: 'CUENTA' } })).toBe(1);
    expect((await post('solicitar')).status).toBe(409);
  });
});

describe('horario del restaurante', () => {
  // Un turno de una hora, todos los días, que nunca incluye "ahora" en Costa Rica.
  const turnosCerrados = () => {
    const h = (new Date(Date.now() - 6 * 3600_000).getUTCHours() + 2) % 24;
    const hh = (n: number) => String(n % 24).padStart(2, '0') + ':00';
    return [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      restauranteId,
      diaSemana: d,
      abre: hh(h),
      cierra: hh(h + 1),
    }));
  };

  it('fuera de horario el comensal no puede pedir (423) pero el mesero sí', async () => {
    await prisma.horarioRestaurante.createMany({ data: turnosCerrados() });
    const menu = await request(app).get('/public/resto-a/menu');
    expect(menu.body.restaurante.abierto).toBe(false);

    const res = await pedir(sesion.token, pedido([casado()]));
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('RESTAURANTE_CERRADO');

    await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteId);
    const delMesero = await request(app)
      .post(`/operacion/mesas/${m.mesa.id}/pedidos`)
      .set('Authorization', `Bearer ${await tokenDe('mesero@resto-a.test')}`)
      .send(pedido([casado()]));
    expect(delMesero.status).toBe(201);
  });

  it('cerrar temporalmente bloquea los pedidos aunque esté en horario (423)', async () => {
    await prisma.restaurante.update({
      where: { id: restauranteId },
      data: { cerradoManual: true },
    });
    const menu = await request(app).get('/public/resto-a/menu');
    expect(menu.body.restaurante).toMatchObject({ abierto: false, cerradoManual: true });
    const res = await pedir(sesion.token, pedido([casado()]));
    expect(res.status).toBe(423);
    expect(res.body.error.message).toMatch(/temporalmente/);
  });

  it('sin horario configurado siempre está abierto', async () => {
    const menu = await request(app).get('/public/resto-a/menu');
    expect(menu.body.restaurante).toMatchObject({ abierto: true, horarioHoy: [] });
  });

  it('el dueño guarda turnos (varios por día) y el menú muestra los de hoy', async () => {
    const dueno = await tokenDe('dueno@resto-a.test');
    const turnos = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [
      { diaSemana: d, abre: '11:00', cierra: '15:00' },
      { diaSemana: d, abre: '18:00', cierra: '02:00' },
    ]);
    const res = await request(app)
      .put('/restaurante/horarios')
      .set('Authorization', `Bearer ${dueno}`)
      .send({ turnos });
    expect(res.status).toBe(200);
    expect(res.body.horarios).toHaveLength(14);
    const malo = await request(app)
      .put('/restaurante/horarios')
      .set('Authorization', `Bearer ${dueno}`)
      .send({ turnos: [{ diaSemana: 7, abre: '25:00', cierra: '10:00' }] });
    expect(malo.status).toBe(400);
    const menu = await request(app).get('/public/resto-a/menu');
    expect(menu.body.restaurante.horarioHoy).toEqual([
      { abre: '11:00', cierra: '15:00' },
      { abre: '18:00', cierra: '02:00' },
    ]);
  });
});

describe('promoción', () => {
  it('el plato en promoción se muestra y se cobra al precio de promo', async () => {
    const dueno = await tokenDe('dueno@resto-a.test');
    const cfg = await request(app)
      .patch('/restaurante')
      .set('Authorization', `Bearer ${dueno}`)
      .send({ platoDestacadoId: m.casado, textoPromoEs: 'Martes de casado', precioPromo: 400000 });
    expect(cfg.status).toBe(200);

    const menu = (await request(app).get('/public/resto-a/menu')).body;
    expect(menu.promocion).toMatchObject({
      platoId: m.casado,
      textoEs: 'Martes de casado',
      precio: 400000,
      precioAntes: 480000,
    });
    const plato = menu.categorias[0].platos.find((p: { id: string }) => p.id === m.casado);
    expect(plato).toMatchObject({ precio: 400000, precioAntes: 480000 });

    // Se cobra la promo + los extras.
    const res = await pedir(
      sesion.token,
      pedido([casado({ modificadores: [m.termino[0], m.extras[0]] })]),
    );
    expect(res.body.items[0].precioUnitario).toBe(450000);
  });

  it('no se puede promocionar un plato de otro restaurante', async () => {
    const b = await crearRestaurante('resto-b');
    const mb = await sembrarMenu(b.restaurante.id);
    const res = await request(app)
      .patch('/restaurante')
      .set('Authorization', `Bearer ${await tokenDe('dueno@resto-a.test')}`)
      .send({ platoDestacadoId: mb.casado });
    expect(res.status).toBe(404);
  });
});
