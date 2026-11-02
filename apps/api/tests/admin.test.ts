import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminRestauranteDetalle, AdminRestauranteFila, AdminResumen } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearUsuario, limpiarBD, PASSWORD, tokenDe } from './helpers';

let admin: string;

const como = (t: string) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
  patch: (u: string) => request(app).patch(u).set('Authorization', `Bearer ${t}`),
});
// Un restaurante que se registra solo (registro abierto).
const registrar = async (nombre: string, email: string) => {
  const r = await request(app)
    .post('/auth/registro')
    .send({
      restaurante: { nombre, telefono: '8888 0000' },
      dueno: { nombre: 'Dueña', email, password: PASSWORD },
    });
  expect(r.status).toBe(201);
  const fila = await prisma.restaurante.findFirstOrThrow({ where: { nombre } });
  return { id: fila.id, token: r.body.accessToken as string };
};
const dias = (iso: string | null) => Math.round((Date.parse(iso!) - Date.now()) / 86_400_000);

beforeEach(async () => {
  await limpiarBD();
  await crearUsuario('admin@x.test', 'SUPERADMIN', null);
  admin = await tokenDe('admin@x.test');
});

describe('superadmin: planes y suscripciones', () => {
  it('el registro empieza en Completo con 30 días de prueba; resumen y búsqueda', async () => {
    await registrar('Soda Uno', 'uno@x.test');
    await registrar('Pizzería Dos', 'dos@x.test');

    const filas = (await como(admin).get('/admin/restaurantes')).body as AdminRestauranteFila[];
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ plan: 'COMPLETO', estado: 'PRUEBA', pedidos30d: 0 });
    expect(dias(filas[0]!.planVenceEn)).toBe(30);
    expect(filas.find((f) => f.nombre === 'Soda Uno')!.dueno).toEqual({
      nombre: 'Dueña',
      email: 'uno@x.test',
    });

    const buscar = await como(admin).get('/admin/restaurantes?buscar=dos@x');
    expect(buscar.body.map((f: AdminRestauranteFila) => f.nombre)).toEqual(['Pizzería Dos']);

    const resumen = (await como(admin).get('/admin/resumen')).body as AdminResumen;
    expect(resumen).toMatchObject({ restaurantes: 2, ingresosMes: 0, mensualRecurrente: 0 });
    expect(resumen.porEstado.PRUEBA).toBe(2);
  });

  it('registrar un pago corre el vencimiento desde el actual y cambia el plan', async () => {
    const { id } = await registrar('Soda Uno', 'uno@x.test');
    const pago = await como(admin)
      .post(`/admin/restaurantes/${id}/pagos`)
      .send({ plan: 'BASICO', meses: 12, monto: 9_900_000, metodo: 'SINPE', referencia: '12345' });
    expect(pago.status).toBe(201);
    const d = pago.body as AdminRestauranteDetalle;
    expect(d).toMatchObject({ plan: 'BASICO', estado: 'AL_DIA' });
    expect(d.pagos).toHaveLength(1);
    // 30 días de prueba + 12 meses.
    expect(dias(d.planVenceEn)).toBeGreaterThan(390);

    const resumen = (await como(admin).get('/admin/resumen')).body as AdminResumen;
    expect(resumen).toMatchObject({ ingresosMes: 9_900_000, mensualRecurrente: 990_000 });

    // Validación: meses fuera de rango.
    const malo = await como(admin)
      .post(`/admin/restaurantes/${id}/pagos`)
      .send({ plan: 'BASICO', meses: 0, monto: 0, metodo: 'SINPE' });
    expect(malo.status).toBe(400);
  });

  it('el plan Básico no tiene pedidos en línea, repartidores ni clientes', async () => {
    const { id, token } = await registrar('Soda Uno', 'uno@x.test');
    const slug = (await prisma.restaurante.findUniqueOrThrow({ where: { id } })).slug;
    await prisma.restaurante.update({ where: { id }, data: { enLineaActivo: true } });
    expect((await como(token).get('/enlinea')).status).toBe(200);

    await como(admin).patch(`/admin/restaurantes/${id}`).send({ plan: 'BASICO' });
    expect((await como(token).get('/enlinea')).body.error.code).toBe('PLAN_NO_INCLUYE');
    expect((await como(token).get('/clientes')).status).toBe(403);
    const menu = await request(app).get(`/public/${slug}/menu`);
    expect(menu.body.restaurante.enLinea.activo).toBe(false);
    const sus = await como(token).get('/restaurante/suscripcion');
    expect(sus.body).toMatchObject({ plan: 'BASICO', estado: 'PRUEBA' });
  });

  it('suspender, filtrar por estado y restablecer la contraseña del dueño', async () => {
    const { id } = await registrar('Soda Uno', 'uno@x.test');
    await registrar('Pizzería Dos', 'dos@x.test');

    await como(admin).patch(`/admin/restaurantes/${id}`).send({ activo: false });
    const suspendidos = await como(admin).get('/admin/restaurantes?estado=SUSPENDIDO');
    expect(suspendidos.body.map((f: AdminRestauranteFila) => f.id)).toEqual([id]);
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'uno@x.test', password: PASSWORD });
    expect(login.status).toBe(401);

    await como(admin).patch(`/admin/restaurantes/${id}`).send({ activo: true });
    const r = await como(admin).post(`/admin/restaurantes/${id}/restablecer-dueno`);
    expect(r.body.email).toBe('uno@x.test');
    const nuevo = await request(app)
      .post('/auth/login')
      .send({ email: 'uno@x.test', password: r.body.passwordTemporal });
    expect(nuevo.status).toBe(200);
    expect(nuevo.body.usuario.debeCambiarPassword).toBe(true);
  });

  it('solo el superadmin entra a /admin', async () => {
    const { token } = await registrar('Soda Uno', 'uno@x.test');
    expect((await como(token).get('/admin/resumen')).status).toBe(403);
    expect((await request(app).get('/admin/restaurantes')).status).toBe(401);
  });
});
