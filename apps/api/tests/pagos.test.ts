import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
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
