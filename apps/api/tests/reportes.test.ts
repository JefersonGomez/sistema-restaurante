import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Reporte } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { historial } from '../prisma/demo-extra';
import {
  abrirSesion,
  crearRestaurante,
  crearUsuario,
  limpiarBD,
  sembrarMenu,
  tokenDe,
} from './helpers';

let a: Awaited<ReturnType<typeof sembrarMenu>>;
let b: Awaited<ReturnType<typeof sembrarMenu>>;
let restauranteA: string;
let restauranteB: string;
let token: string;

const reporte = async (desde: string, hasta: string, t = token) =>
  request(app).get(`/reportes?desde=${desde}&hasta=${hasta}`).set('Authorization', `Bearer ${t}`);

// Cuenta cerrada a una hora UTC dada, con un pedido confirmado de `cantidad` casados.
async function cuentaCerrada(
  restauranteId: string,
  m: typeof a,
  cerradaEn: string,
  total: number,
  metodoPago: 'EFECTIVO' | 'TARJETA' | 'SINPE',
  cantidad = 1,
) {
  const cuenta = await prisma.cuenta.create({
    data: {
      restauranteId,
      mesaId: m.mesa.id,
      estado: 'CERRADA',
      total,
      metodoPago,
      cerradaEn: new Date(cerradaEn),
    },
  });
  const confirmadoEn = new Date(new Date(cerradaEn).getTime() - 60 * 60_000);
  await prisma.pedido.create({
    data: {
      restauranteId,
      cuentaId: cuenta.id,
      estado: 'CONFIRMADO',
      clientRequestId: `r-${cuenta.id}`,
      confirmadoEn,
      items: {
        create: {
          platoId: m.casado,
          estacionId: m.estaciones.cocina,
          cantidad,
          precioUnitario: 480000,
          estado: 'ENTREGADO',
          // 10 min de preparación; listo 30 min después de confirmado → demorado.
          enPreparacionEn: new Date(confirmadoEn.getTime() + 20 * 60_000),
          listoEn: new Date(confirmadoEn.getTime() + 30 * 60_000),
        },
      },
    },
  });
}

beforeAll(async () => {
  await limpiarBD();
  restauranteA = (await crearRestaurante('resto-a')).restaurante.id;
  restauranteB = (await crearRestaurante('resto-b')).restaurante.id;
  a = await sembrarMenu(restauranteA);
  b = await sembrarMenu(restauranteB);
  token = await tokenDe('dueno@resto-a.test');

  // 2026-10-20 03:00 UTC = 19 oct 21:00 en Costa Rica (UTC−6): cuenta para el 19.
  await cuentaCerrada(restauranteA, a, '2026-10-20T03:00:00Z', 500000, 'EFECTIVO');
  await cuentaCerrada(restauranteA, a, '2026-10-20T18:30:00Z', 1000000, 'TARJETA', 2);
  await cuentaCerrada(restauranteA, a, '2026-10-21T15:00:00Z', 300000, 'SINPE');
  // Fuera del rango y de otro restaurante: no deben contar.
  await cuentaCerrada(restauranteA, a, '2026-09-01T15:00:00Z', 999999, 'EFECTIVO');
  await cuentaCerrada(restauranteB, b, '2026-10-20T18:00:00Z', 777777, 'EFECTIVO');
  // Cuenta abierta del rango: no es venta.
  await prisma.cuenta.create({
    data: { restauranteId: restauranteA, mesaId: a.mesa2.id, total: 123456 },
  });
});

describe('reportes por rango', () => {
  it('los totales cuadran con la suma de las cuentas cerradas, por día local', async () => {
    const res = await reporte('2026-10-19', '2026-10-21');
    expect(res.status).toBe(200);
    const r = res.body as Reporte;
    const cerradas = await prisma.cuenta.aggregate({
      where: {
        restauranteId: restauranteA,
        estado: 'CERRADA',
        cerradaEn: { gte: new Date('2026-10-19T06:00:00Z'), lt: new Date('2026-10-22T06:00:00Z') },
      },
      _sum: { total: true },
      _count: true,
    });
    expect(r.resumen.totalVendido).toBe(cerradas._sum.total);
    expect(r.resumen).toEqual({ totalVendido: 1800000, cuentas: 3, ticketPromedio: 600000 });
    expect(r.porDia).toEqual([
      { dia: '2026-10-19', total: 500000, cuentas: 1 },
      { dia: '2026-10-20', total: 1000000, cuentas: 1 },
      { dia: '2026-10-21', total: 300000, cuentas: 1 },
    ]);
    expect(r.porDia.reduce((s, d) => s + d.total, 0)).toBe(r.resumen.totalVendido);
    // Horas locales: 21:00, 12:30 y 9:00.
    expect(r.porHora).toHaveLength(24);
    expect(r.porHora.filter((h) => h.cuentas).map((h) => h.hora)).toEqual([9, 12, 21]);
  });

  it('desglosa por método de pago, platos, categoría y preparación', async () => {
    const r = (await reporte('2026-10-19', '2026-10-21')).body as Reporte;
    expect(r.porMetodo).toEqual([
      { metodo: 'TARJETA', total: 1000000, cuentas: 1 },
      { metodo: 'EFECTIVO', total: 500000, cuentas: 1 },
      { metodo: 'SINPE', total: 300000, cuentas: 1 },
    ]);
    expect(r.topPlatos).toEqual([
      { platoId: a.casado, nombre: 'Casado', cantidad: 4, total: 1920000 },
    ]);
    expect(r.porCategoria).toEqual([{ categoria: 'Todo', cantidad: 4, total: 1920000 }]);
    expect(r.preparacion).toEqual([
      { estacion: 'Cocina', items: 3, promedioSeg: 600, demorados: 3 },
    ]);
  });

  it('cuenta las vistas del detalle de un plato y las cancelaciones con motivo', async () => {
    const { token: sesion } = await abrirSesion(a.mesa2.tokenQr);
    for (let i = 0; i < 3; i++)
      await request(app)
        .post(`/public/cuenta/vistas/${a.refresco}`)
        .set('Authorization', `Bearer ${sesion}`)
        .expect(204);
    // Un plato de otro restaurante no se registra.
    await request(app)
      .post(`/public/cuenta/vistas/${b.refresco}`)
      .set('Authorization', `Bearer ${sesion}`);

    const cuenta = await prisma.cuenta.findFirstOrThrow({
      where: { restauranteId: restauranteA, estado: 'ABIERTA' },
    });
    await prisma.pedido.create({
      data: {
        restauranteId: restauranteA,
        cuentaId: cuenta.id,
        estado: 'CANCELADO',
        clientRequestId: 'cancelado-1',
        items: {
          create: {
            platoId: a.refresco,
            estacionId: a.estaciones.bar,
            cantidad: 2,
            precioUnitario: 100000,
            cancelado: true,
            motivoCancelacion: 'Se acabó',
          },
        },
      },
    });

    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(
      new Date(),
    );
    const r = (await reporte(hoy, hoy)).body as Reporte;
    // El más visto primero; el Casado aparece por lo pedido (sin vistas).
    expect(r.vistasVsPedidos[0]).toEqual({
      platoId: a.refresco,
      nombre: 'Refresco',
      vistas: 3,
      pedidos: 0,
    });
    expect(r.vistasVsPedidos.every((p) => p.platoId !== b.refresco)).toBe(true);
    expect(r.cancelaciones).toEqual([{ motivo: 'Se acabó', items: 2 }]);
    const vistasB = await prisma.vistaPlato.count({ where: { restauranteId: restauranteB } });
    expect(vistasB).toBe(0);
  });

  it('aislamiento: otro restaurante solo ve lo suyo', async () => {
    const otro = await tokenDe('dueno@resto-b.test');
    const r = (await reporte('2026-10-19', '2026-10-21', otro)).body as Reporte;
    expect(r.resumen).toEqual({ totalVendido: 777777, cuentas: 1, ticketPromedio: 777777 });
  });

  it('valida el rango de fechas y exige rol de dueño', async () => {
    expect((await reporte('2026-10-21', '2026-10-01')).status).toBe(400);
    expect((await reporte('2025-01-01', '2026-10-01')).status).toBe(400);
    expect((await reporte('ayer', 'hoy')).status).toBe(400);
    expect((await request(app).get('/reportes?desde=2026-10-01&hasta=2026-10-02')).status).toBe(
      401,
    );
  });
});

describe('reportes con el historial del seed', () => {
  it('30 días: el total cuadra con la suma de las cuentas cerradas y carga rápido', async () => {
    const { restaurante } = await crearRestaurante('resto-seed');
    await sembrarMenu(restaurante.id);
    await crearUsuario('mesero@resto-seed.test', 'MESERO', restaurante.id);
    await crearUsuario('caja@resto-seed.test', 'CAJA', restaurante.id);
    const creadas = await historial(restaurante);
    expect(creadas).toBeGreaterThan(300);

    const zona = 'America/Costa_Rica';
    const dia = (atras: number) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(
        new Date(Date.now() - atras * 86_400_000),
      );
    const t = await tokenDe('dueno@resto-seed.test');
    const inicio = Date.now();
    const res = await reporte(dia(30), dia(1), t);
    expect(Date.now() - inicio).toBeLessThan(1000);
    const r = res.body as Reporte;

    const suma = await prisma.cuenta.aggregate({
      where: { restauranteId: restaurante.id, estado: 'CERRADA' },
      _sum: { total: true },
      _count: true,
    });
    expect(r.resumen.cuentas).toBe(suma._count);
    expect(r.resumen.totalVendido).toBe(suma._sum.total);
    expect(r.porMetodo.reduce((s, m) => s + m.total, 0)).toBe(suma._sum.total);
    expect(r.porHora.reduce((s, h) => s + h.cuentas, 0)).toBe(suma._count);
    // Lo del seed no se mezcla con el resto de restaurantes de la prueba.
    expect((await reporte(dia(30), dia(1))).body.resumen.cuentas).toBeLessThan(10);
  });
});
