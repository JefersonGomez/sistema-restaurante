import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { correosEnviados } from '../src/lib/correo';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, limpiarBD, PASSWORD } from './helpers';

// El enlace que llegó por correo → su token.
const tokenDelCorreo = () => {
  const ultimo = correosEnviados.at(-1)!;
  return { para: ultimo.para, token: /token=([\w-]+)/.exec(ultimo.texto)![1]! };
};

beforeEach(async () => {
  await limpiarBD();
  correosEnviados.length = 0;
  await crearRestaurante('resto-a');
});

describe('olvidé mi contraseña', () => {
  it('personal: el enlace cambia la contraseña una sola vez y cierra las sesiones', async () => {
    // Correo que no existe: misma respuesta y no sale nada.
    expect((await request(app).post('/auth/olvide').send({ email: 'nadie@x.test' })).status).toBe(
      204,
    );
    expect(correosEnviados).toHaveLength(0);

    const sesion = await request(app)
      .post('/auth/login')
      .send({ email: 'dueno@resto-a.test', password: PASSWORD });
    expect(
      (await request(app).post('/auth/olvide').send({ email: 'DUENO@resto-a.test' })).status,
    ).toBe(204);
    const { para, token } = tokenDelCorreo();
    expect(para).toBe('dueno@resto-a.test');

    const cambio = (t: string) =>
      request(app).post('/auth/restablecer').send({ token: t, password: 'NuevaClave99' });
    expect((await cambio(token)).status).toBe(204);
    expect((await cambio(token)).body.error.code).toBe('ENLACE_INVALIDO'); // un solo uso

    const vieja = await request(app)
      .post('/auth/login')
      .send({ email: 'dueno@resto-a.test', password: PASSWORD });
    expect(vieja.status).toBe(401);
    const nueva = await request(app)
      .post('/auth/login')
      .send({ email: 'dueno@resto-a.test', password: 'NuevaClave99' });
    expect(nueva.status).toBe(200);
    // El refresh de la sesión anterior quedó revocado.
    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', sesion.headers['set-cookie']!);
    expect(refresh.status).toBe(401);
  });

  it('el enlace vence en 1 hora', async () => {
    await request(app).post('/auth/olvide').send({ email: 'dueno@resto-a.test' });
    const { token } = tokenDelCorreo();
    await prisma.recuperacionPassword.updateMany({ data: { expiraEn: new Date(Date.now() - 1) } });
    const r = await request(app)
      .post('/auth/restablecer')
      .send({ token, password: 'NuevaClave99' });
    expect(r.body.error.code).toBe('ENLACE_INVALIDO');
  });

  it('clientes: el enlace es del restaurante de su cuenta', async () => {
    await request(app)
      .post('/public/resto-a/clientes/registro')
      .send({ nombre: 'Ana', telefono: '8888 1234', email: 'ana@x.test', password: 'secreta123' });
    await request(app).post('/public/resto-a/clientes/olvide').send({ email: 'ana@x.test' });
    const { token } = tokenDelCorreo();
    expect(correosEnviados.at(-1)!.texto).toContain('/r/resto-a/restablecer?token=');

    const ok = await request(app)
      .post('/public/resto-a/clientes/restablecer')
      .send({ token, password: 'otra-clave-1' });
    expect(ok.status).toBe(204);
    const entrar = await request(app)
      .post('/public/resto-a/clientes/entrar')
      .send({ email: 'ana@x.test', password: 'otra-clave-1' });
    expect(entrar.status).toBe(200);
  });
});
