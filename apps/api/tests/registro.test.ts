import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { limpiarBD } from './helpers';

const datos = (email = 'marta@soda.test', nombre = 'Soda Doña Marta') => ({
  restaurante: { nombre, telefono: '8888 8888', direccion: 'Barrio Escalante, San José' },
  dueno: { nombre: 'Marta', email, password: 'Clave123!' },
});
const registrar = (body: object) => request(app).post('/auth/registro').send(body);

beforeEach(limpiarBD);

describe('registro de restaurantes', () => {
  it('crea el restaurante activo con su dueño, estaciones y horario, y deja la sesión iniciada', async () => {
    const res = await registrar(datos());
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
    expect(res.body.usuario).toMatchObject({ rol: 'DUENO', email: 'marta@soda.test' });
    expect(res.body.usuario.restaurante.slug).toBe('soda-dona-marta');

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    const r = await prisma.restaurante.findUniqueOrThrow({
      where: { slug: 'soda-dona-marta' },
      include: { estaciones: true, horarios: true },
    });
    expect(r).toMatchObject({ activo: true, telefono: '8888 8888' });
    expect(r.estaciones.map((e) => e.nombre).sort()).toEqual(['Bar', 'Cocina']);
    expect(r.horarios).toHaveLength(7);
    // Su menú público ya existe.
    expect((await request(app).get('/public/soda-dona-marta/menu')).status).toBe(200);
  });

  it('el mismo nombre recibe otro slug; el mismo correo no se puede registrar dos veces', async () => {
    await registrar(datos());
    const otro = await registrar(datos('otra@soda.test'));
    expect(otro.body.usuario.restaurante.slug).toBe('soda-dona-marta-2');
    const repetido = await registrar(datos('MARTA@soda.test', 'Otra soda'));
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('CORREO_EN_USO');
  });

  it('valida los datos (teléfono, contraseña, correo)', async () => {
    const mal = (cambio: object) => registrar({ ...datos(), ...cambio });
    expect((await mal({ restaurante: { nombre: 'X', telefono: '12' } })).body.error.code).toBe(
      'VALIDACION',
    );
    expect(
      (await mal({ dueno: { nombre: 'M', email: 'no-es-correo', password: 'Clave123!' } })).status,
    ).toBe(400);
    expect(
      (await mal({ dueno: { nombre: 'M', email: 'a@b.test', password: 'corta' } })).status,
    ).toBe(400);
    expect(await prisma.restaurante.count()).toBe(0);
  });
});
