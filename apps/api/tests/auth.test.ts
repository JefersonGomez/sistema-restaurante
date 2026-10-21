import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { PASSWORD, crearRestaurante, limpiarBD } from './helpers';

const EMAIL = 'dueno@resto-a.test';

const refreshCookie = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('refreshToken='));

describe('auth', () => {
  beforeEach(async () => {
    await limpiarBD();
    await crearRestaurante('resto-a');
  });

  it('login correcto devuelve access token, usuario y cookie httpOnly', async () => {
    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.usuario).toMatchObject({ email: EMAIL, rol: 'DUENO' });
    expect(res.body.usuario.passwordHash).toBeUndefined();
    expect(refreshCookie(res)).toMatch(/HttpOnly/);
  });

  it('email en mayúsculas y con espacios también entra', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: '  DUENO@resto-a.test ', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('contraseña incorrecta → 401', async () => {
    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('email inexistente → 401 con el mismo error', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nadie@x.test', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('body inválido → 400 con formato uniforme', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDACION' });
    expect(res.body.error.details).toBeDefined();
  });

  it('usuario inactivo no puede entrar', async () => {
    await prisma.usuario.update({ where: { email: EMAIL }, data: { activo: false } });
    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me con y sin token', async () => {
    expect((await request(app).get('/auth/me')).status).toBe(401);
    expect((await request(app).get('/auth/me').set('Authorization', 'Bearer basura')).status).toBe(
      401,
    );

    const login = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.usuario.email).toBe(EMAIL);
  });

  it('refresh rota el token; reusar el viejo cierra todas las sesiones', async () => {
    const login = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    const cookie1 = refreshCookie(login)!;

    const r1 = await request(app).post('/auth/refresh').set('Cookie', cookie1);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTypeOf('string');
    const cookie2 = refreshCookie(r1)!;
    expect(cookie2).not.toBe(cookie1);

    // Reuso del token ya rotado → 401 y se revoca también el nuevo.
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie1)).status).toBe(401);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie2)).status).toBe(401);
  });

  it('logout revoca el refresh token', async () => {
    const login = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    const cookie = refreshCookie(login)!;
    expect((await request(app).post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('ruta inexistente → 404 con formato uniforme', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_ENCONTRADO');
  });
});
