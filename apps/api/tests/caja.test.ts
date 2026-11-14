import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TurnoCajaDetalle } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, crearUsuario, limpiarBD, sembrarMenu, tokenDe } from './helpers';

let restauranteId: string;
let mesaId: string;
let caja: string;
const como = (t: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
});
const turno = async () => (await como(caja).get('/caja/turno')).body as TurnoCajaDetalle | null;

// Cuenta cerrada "ahora" (o en la fecha dada).
const cerrada = (datos: object) =>
  prisma.cuenta.create({
    data: { restauranteId, estado: 'CERRADA', cerradaEn: new Date(), ...datos },
  });

beforeEach(async () => {
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  restauranteId = restaurante.id;
  mesaId = (await sembrarMenu(restauranteId)).mesa.id;
  await crearUsuario('caja@resto-a.test', 'CAJA', restauranteId);
  caja = await tokenDe('caja@resto-a.test');
});

describe('arqueo de caja', () => {
  it('abre, anota movimientos, calcula el esperado y cierra con la diferencia', async () => {
    expect(await turno()).toBeNull();
    const sinCaja = await como(caja)
      .post('/caja/turno/movimientos')
      .send({ tipo: 'SALIDA', monto: 100000, motivo: 'Gas' });
    expect(sinCaja.body.error.code).toBe('CAJA_CERRADA');

    // Antes de abrir: no cuenta.
    await cerrada({
      mesaId,
      total: 999900,
      metodoPago: 'EFECTIVO',
      cerradaEn: new Date(Date.now() - 3_600_000),
    });

    const a = await como(caja).post('/caja/turno/abrir').send({ fondoInicial: 3000000 });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ fondoInicial: 3000000, abiertoPorNombre: 'caja@resto-a.test' });
    expect(
      (await como(caja).post('/caja/turno/abrir').send({ fondoInicial: 0 })).body.error.code,
    ).toBe('CAJA_YA_ABIERTA');

    // Mixta: ₡5 000 efectivo + ₡7 000 tarjeta. SINPE sin detalle: ₡2 000.
    const mixta = await cerrada({ mesaId, total: 1200000, metodoPago: 'MIXTO' });
    await prisma.lineaCobro.createMany({
      data: [
        {
          cuentaId: mixta.id,
          metodo: 'EFECTIVO',
          monto: 500000,
          recibido: 1000000,
          vuelto: 500000,
        },
        { cuentaId: mixta.id, metodo: 'TARJETA', monto: 700000 },
      ],
    });
    await cerrada({ mesaId, total: 200000, metodoPago: 'SINPE' });
    // Domicilio en efectivo: solo cuenta cuando la caja recibe la plata del repartidor.
    await crearUsuario('rep@resto-a.test', 'REPARTIDOR', restauranteId);
    const rep = await prisma.usuario.findFirstOrThrow({ where: { email: 'rep@resto-a.test' } });
    await cerrada({
      tipo: 'DOMICILIO',
      etapa: 'ENTREGADO',
      total: 300000,
      metodoPago: 'EFECTIVO',
      repartidorId: rep.id,
    });
    expect((await turno())!.resumen.ventasEfectivo).toBe(500000);
    const recibir = await como(caja)
      .post('/enlinea/efectivo/recibir')
      .send({ repartidorId: rep.id });
    expect(recibir.status).toBe(200);

    await como(caja)
      .post('/caja/turno/movimientos')
      .send({ tipo: 'SALIDA', monto: 100000, motivo: 'Gas' });
    await como(caja)
      .post('/caja/turno/movimientos')
      .send({ tipo: 'ENTRADA', monto: 50000, motivo: 'Cambio' });

    const t = (await turno())!;
    expect(t.resumen).toEqual({
      ventasEfectivo: 800000,
      ventasTarjeta: 700000,
      ventasSinpe: 200000,
      cuentas: 3,
      entradas: 50000,
      salidas: 100000,
      efectivoEsperado: 3000000 + 800000 + 50000 - 100000,
    });
    expect(t.movimientos.map((m) => m.motivo)).toEqual(['Gas', 'Cambio']);

    // Cierra con ₡200 de faltante.
    const c = await como(caja)
      .post('/caja/turno/cerrar')
      .send({ efectivoContado: t.resumen.efectivoEsperado - 20000, nota: 'Faltan 200' });
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ diferencia: -20000, nota: 'Faltan 200' });
    expect(c.body.cerradoEn).not.toBeNull();
    expect(await turno()).toBeNull();

    // El cierre queda fijo aunque después entren más ventas.
    await cerrada({ mesaId, total: 100000, metodoPago: 'EFECTIVO' });
    const historial = (await como(caja).get('/caja/turnos')).body as TurnoCajaDetalle[];
    expect(historial).toHaveLength(1);
    expect(historial[0]!.resumen).toEqual(t.resumen);
    expect(
      (await como(caja).post('/caja/turno/cerrar').send({ efectivoContado: 0 })).body.error.code,
    ).toBe('CAJA_CERRADA');
  });

  it('valida montos, exige rol de caja o dueño y aísla por restaurante', async () => {
    expect((await como(caja).post('/caja/turno/abrir').send({ fondoInicial: -1 })).status).toBe(
      400,
    );
    const { body } = await como(caja).post('/caja/turno/abrir').send({ fondoInicial: 0 });
    expect(
      (
        await como(caja)
          .post('/caja/turno/movimientos')
          .send({ tipo: 'SALIDA', monto: 0, motivo: 'x' })
      ).status,
    ).toBe(400);

    await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteId);
    expect((await como(await tokenDe('mesero@resto-a.test')).get('/caja/turno')).status).toBe(403);

    const otro = (await crearRestaurante('resto-b')).restaurante;
    await crearUsuario('caja@resto-b.test', 'CAJA', otro.id);
    const cajaB = await tokenDe('caja@resto-b.test');
    expect((await como(cajaB).get(`/caja/turnos/${body.id}`)).status).toBe(404);
    expect((await como(cajaB).get('/caja/turno')).body).toBeNull();
  });
});
