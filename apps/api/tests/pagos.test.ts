import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calcularTotales, type CuentaDetalle } from '@menu-qr/shared';
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
let caja: string;
let cuentaId: string;
const comoCaja = (t = caja) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
  delete: (u: string) => request(app).delete(u).set('Authorization', `Bearer ${t}`),
});
const cuenta = async () =>
  (await comoCaja().get(`/operacion/cuentas/${cuentaId}`)).body as CuentaDetalle;
const items = async () => (await cuenta()).pedidos.flatMap((p) => p.items);
const cobrar = (body: object) => comoCaja().post(`/operacion/cuentas/${cuentaId}/pagos`).send(body);
const config = { porcentajeIva: 13, porcentajeServicio: 10, preciosIncluyenImpuestos: true };

beforeEach(async () => {
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  m = await sembrarMenu(restaurante.id);
  await prisma.restaurante.update({
    where: { id: restaurante.id },
    data: { modoConfirmacion: 'NUNCA', ...config },
  });
  await crearUsuario('caja@resto-a.test', 'CAJA', restaurante.id);
  caja = await tokenDe('caja@resto-a.test');
  // Mesa 1: 1 casado (₡4 800) + 2 refrescos (₡1 500 c/u), pedido confirmado.
  const s = await abrirSesion(m.mesa.tokenQr);
  cuentaId = s.cuentaId;
  const pedido = await request(app)
    .post('/public/cuenta/pedidos')
    .set('Authorization', `Bearer ${s.token}`)
    .send({
      clientRequestId: nuevoRequestId(),
      items: [
        { platoId: m.casado, cantidad: 1, modificadores: [m.termino[0]] },
        { platoId: m.refresco, cantidad: 2 },
      ],
    });
  expect(pedido.status).toBe(201);
});

describe('cuentas separadas', () => {
  it('cobra por grupos, divide un ítem con cantidad > 1 y cierra al cobrar lo último', async () => {
    const [casado, refrescos] = await items();
    const a = await cobrar({
      nombre: 'Ana',
      metodoPago: 'TARJETA',
      items: [{ itemId: casado!.id, cantidad: 1 }],
    });
    expect(a.status).toBe(200);
    expect(a.body.cerrada).toBe(false);
    expect(a.body.cuenta.pagos).toHaveLength(1);
    expect(a.body.cuenta.pagos[0]).toMatchObject({
      nombre: 'Ana',
      metodoPago: 'TARJETA',
      ...calcularTotales([{ precioUnitario: 480000, cantidad: 1 }], config),
    });

    // Un refresco de los dos.
    const b = await cobrar({
      metodoPago: 'EFECTIVO',
      items: [{ itemId: refrescos!.id, cantidad: 1 }],
    });
    expect(b.body.cerrada).toBe(false);
    const ahora = await items();
    expect(ahora).toHaveLength(3);
    const sinPagar = ahora.filter((i) => !i.pagoId);
    expect(sinPagar).toMatchObject([{ platoId: m.refresco, cantidad: 1 }]);

    // "Todo junto" ya no aplica: hay pagos separados.
    expect(
      (
        await comoCaja()
          .post(`/operacion/cuentas/${cuentaId}/cerrar`)
          .send({ metodoPago: 'EFECTIVO' })
      ).body.error.code,
    ).toBe('PAGO_SEPARADO');

    const c = await cobrar({
      metodoPago: 'SINPE',
      items: [{ itemId: sinPagar[0]!.id, cantidad: 1 }],
    });
    expect(c.body.cerrada).toBe(true);
    const final = c.body.cuenta as CuentaDetalle;
    expect(final.estado).toBe('CERRADA');
    expect(final.metodoPago).toBe('MIXTO');
    // El total de la cuenta es lo que efectivamente se cobró.
    expect(final.total).toBe(final.pagos.reduce((s, p) => s + p.total, 0));
    expect(final.pagos).toHaveLength(3);
  });

  it('un solo método en todos los grupos → la cuenta queda con ese método', async () => {
    const [casado, refrescos] = await items();
    await cobrar({ metodoPago: 'SINPE', items: [{ itemId: casado!.id, cantidad: 1 }] });
    const r = await cobrar({
      metodoPago: 'SINPE',
      items: [{ itemId: refrescos!.id, cantidad: 2 }],
    });
    expect(r.body.cuenta).toMatchObject({ estado: 'CERRADA', metodoPago: 'SINPE' });
  });

  it('rechaza ítems ya cobrados, cantidades de más y cuentas de otro restaurante', async () => {
    const [casado, refrescos] = await items();
    await cobrar({ metodoPago: 'EFECTIVO', items: [{ itemId: casado!.id, cantidad: 1 }] });
    expect(
      (await cobrar({ metodoPago: 'EFECTIVO', items: [{ itemId: casado!.id, cantidad: 1 }] }))
        .status,
    ).toBe(409);
    expect(
      (await cobrar({ metodoPago: 'EFECTIVO', items: [{ itemId: refrescos!.id, cantidad: 3 }] }))
        .status,
    ).toBe(409);
    expect((await cobrar({ metodoPago: 'EFECTIVO', items: [] })).status).toBe(400);

    await crearRestaurante('resto-b');
    await crearUsuario(
      'caja@resto-b.test',
      'CAJA',
      (await prisma.restaurante.findUniqueOrThrow({ where: { slug: 'resto-b' } })).id,
    );
    const ajeno = await tokenDe('caja@resto-b.test');
    expect(
      (
        await comoCaja(ajeno)
          .post(`/operacion/cuentas/${cuentaId}/pagos`)
          .send({ metodoPago: 'EFECTIVO', items: [{ itemId: refrescos!.id, cantidad: 1 }] })
      ).status,
    ).toBe(404);
  });

  it('deshacer un grupo devuelve sus ítems a "sin pagar" (solo con la cuenta abierta)', async () => {
    const [casado] = await items();
    const pago = (
      await cobrar({ metodoPago: 'TARJETA', items: [{ itemId: casado!.id, cantidad: 1 }] })
    ).body.cuenta.pagos[0];
    const r = await comoCaja().delete(`/operacion/cuentas/${cuentaId}/pagos/${pago.id}`);
    expect(r.status).toBe(200);
    expect(r.body.pagos).toEqual([]);
    expect((await items()).every((i) => !i.pagoId)).toBe(true);
    // Sin pagos, "todo junto" vuelve a funcionar.
    expect(
      (
        await comoCaja()
          .post(`/operacion/cuentas/${cuentaId}/cerrar`)
          .send({ metodoPago: 'EFECTIVO' })
      ).status,
    ).toBe(200);
  });
});

describe('detalle del pago (Fase 13)', () => {
  const cerrar = (body: object) =>
    comoCaja().post(`/operacion/cuentas/${cuentaId}/cerrar`).send(body);

  it('efectivo con vuelto y mixto que suma el total', async () => {
    const { total } = await cuenta();
    const efectivo = 500000;
    const r = await cerrar({
      metodoPago: 'MIXTO',
      lineas: [
        { metodo: 'EFECTIVO', monto: efectivo, recibido: 1000000 },
        {
          metodo: 'TARJETA',
          monto: total - efectivo,
          ultimos4: '4242',
          autorizacion: 'A12345',
        },
      ],
    });
    expect(r.status).toBe(200);
    const c = await cuenta();
    expect(c).toMatchObject({ estado: 'CERRADA', metodoPago: 'MIXTO' });
    expect(c.lineasCobro).toMatchObject([
      { metodo: 'EFECTIVO', monto: efectivo, recibido: 1000000, vuelto: 500000 },
      { metodo: 'TARJETA', ultimos4: '4242', autorizacion: 'A12345', vuelto: 0 },
    ]);
  });

  it('rechaza líneas que no suman, mixto sin líneas, método que no coincide y vuelto negativo', async () => {
    const { total } = await cuenta();
    const no = async (body: object, codigo: string) => {
      const r = await cerrar(body);
      expect(r.body.error?.code).toBe(codigo);
    };
    await no(
      { metodoPago: 'EFECTIVO', lineas: [{ metodo: 'EFECTIVO', monto: total - 100 }] },
      'COBRO_NO_CUADRA',
    );
    await no({ metodoPago: 'MIXTO' }, 'VALIDACION');
    await no(
      { metodoPago: 'TARJETA', lineas: [{ metodo: 'EFECTIVO', monto: total }] },
      'VALIDACION',
    );
    await no(
      {
        metodoPago: 'EFECTIVO',
        lineas: [{ metodo: 'EFECTIVO', monto: total, recibido: total - 1 }],
      },
      'VALIDACION',
    );
    await no(
      { metodoPago: 'SINPE', lineas: [{ metodo: 'SINPE', monto: total, ultimos4: '1234' }] },
      'VALIDACION',
    );
    expect((await cuenta()).estado).not.toBe('CERRADA');
  });

  it('cada grupo de una cuenta separada guarda su detalle; deshacer lo borra', async () => {
    const [casado] = await items();
    const a = await cobrar({
      metodoPago: 'SINPE',
      lineas: [{ metodo: 'SINPE', monto: 0, comprobante: '999' }],
      items: [{ itemId: casado!.id, cantidad: 1 }],
    });
    expect(a.status).toBe(400); // monto mínimo 1
    const pre = calcularTotales([{ precioUnitario: casado!.precioUnitario, cantidad: 1 }], config);
    const b = await cobrar({
      metodoPago: 'SINPE',
      lineas: [{ metodo: 'SINPE', monto: pre.total, comprobante: '999' }],
      items: [{ itemId: casado!.id, cantidad: 1 }],
    });
    expect(b.status).toBe(200);
    const pago = (b.body.cuenta as CuentaDetalle).pagos[0]!;
    expect(pago.lineas).toMatchObject([{ metodo: 'SINPE', comprobante: '999' }]);
    await comoCaja().delete(`/operacion/cuentas/${cuentaId}/pagos/${pago.id}`);
    expect(await prisma.lineaCobro.count()).toBe(0);
  });
});

describe('CABYS e IVA por plato (Fase 13)', () => {
  let dueno: string;
  const comoDueno = () => ({
    patch: (u: string) => request(app).patch(u).set('Authorization', `Bearer ${dueno}`),
    get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${dueno}`),
  });
  beforeEach(async () => {
    dueno = await tokenDe('dueno@resto-a.test');
  });
  afterEach(() => vi.restoreAllMocks());

  it('guarda el código CABYS general del restaurante', async () => {
    const r = (cabysGeneral: string | null) =>
      comoDueno().patch('/restaurante').send({ cabysGeneral });
    expect((await r('63320')).status).toBe(400);
    expect((await r('6332000000000')).body.cabysGeneral).toBe('6332000000000');
    expect((await r(null)).body.cabysGeneral).toBeNull();
  });

  it('valida el código CABYS y la tarifa', async () => {
    const plato = (body: object) => comoDueno().patch(`/platos/${m.refresco}`).send(body);
    expect((await plato({ cabys: '123' })).status).toBe(400);
    expect((await plato({ tarifaIva: 7 })).status).toBe(400);
    const ok = await plato({ cabys: '6331000000000', tarifaIva: 0 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ cabys: '6331000000000', tarifaIva: 0 });
    expect((await plato({ cabys: null, tarifaIva: null })).body).toMatchObject({
      cabys: null,
      tarifaIva: null,
    });
  });

  it('el pedido copia la tarifa del plato y la cuenta calcula el IVA por tarifa', async () => {
    await comoDueno().patch(`/platos/${m.refresco}`).send({ tarifaIva: 0 });
    const s = await abrirSesion(m.mesa2.tokenQr);
    await request(app)
      .post('/public/cuenta/pedidos')
      .set('Authorization', `Bearer ${s.token}`)
      .send({
        clientRequestId: nuevoRequestId(),
        items: [
          { platoId: m.casado, cantidad: 1, modificadores: [m.termino[0]] },
          { platoId: m.refresco, cantidad: 2 },
        ],
      });
    const c = (await comoCaja().get(`/operacion/cuentas/${s.cuentaId}`)).body as CuentaDetalle;
    const lineas = c.pedidos.flatMap((p) => p.items);
    expect(lineas.find((i) => i.platoId === m.refresco)?.tarifaIva).toBe(0);
    expect(lineas.find((i) => i.platoId === m.casado)?.tarifaIva).toBeNull();
    expect(c.total).toBe(calcularTotales(lineas, config).total);
    // Distinto de calcularlo todo al 13 %.
    expect(c.montoIva).not.toBe(
      calcularTotales(
        lineas.map((l) => ({ ...l, tarifaIva: null })),
        config,
      ).montoIva,
    );
  });

  it('busca en el catálogo CABYS de Hacienda y avisa si no responde', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          cabys: [{ codigo: '6331000000000', descripcion: 'Comida', impuesto: 13, categorias: [] }],
        }),
      ),
    );
    const r = await comoDueno().get('/platos/cabys?q=comida');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ codigo: '6331000000000', descripcion: 'Comida', impuesto: 13 }]);
    expect(String(fetch.mock.calls[0]![0])).toContain('q=comida');

    fetch.mockRejectedValueOnce(new Error('sin red'));
    expect((await comoDueno().get('/platos/cabys?q=comida')).body.error.code).toBe(
      'CABYS_NO_DISPONIBLE',
    );
    expect((await comoDueno().get('/platos/cabys?q=a')).status).toBe(400);
    expect((await comoCaja().get('/platos/cabys?q=comida')).status).toBe(403);
  });
});
