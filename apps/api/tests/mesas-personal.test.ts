import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, crearUsuario, limpiarBD, PASSWORD, tokenDe } from './helpers';

let restauranteA: string;
let restauranteB: string;
let token: string;
const como = (t = token) => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${t}`),
});
// Cantidad de páginas de un PDF (cuenta los objetos /Type /Page).
const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
const binario = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (c: Buffer) => partes.push(c));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  });

beforeEach(async () => {
  await limpiarBD();
  restauranteA = (await crearRestaurante('resto-a')).restaurante.id;
  restauranteB = (await crearRestaurante('resto-b')).restaurante.id;
  token = await tokenDe('dueno@resto-a.test');
});

describe('mesas en lote y PDF de QR', () => {
  it('crea las mesas de un rango y salta las que ya existen', async () => {
    await prisma.mesa.create({
      data: { restauranteId: restauranteA, numero: 3, tokenQr: 'ya-existia-0000000000001' },
    });
    const res = await como().post('/mesas/lote').send({ desde: 1, hasta: 12 });
    expect(res.body).toEqual({ creadas: 11, yaExistian: 1 });
    expect(await prisma.mesa.count({ where: { restauranteId: restauranteA } })).toBe(12);
    expect((await como().post('/mesas/lote').send({ desde: 5, hasta: 1 })).status).toBe(400);
  });

  it('PDF tamaño carta: 12 mesas = 2 hojas de tarjetas o 12 hojas de acrílico', async () => {
    await como().post('/mesas/lote').send({ desde: 1, hasta: 12 });
    const tarjetas = await binario(como().get('/mesas/qr.pdf'));
    expect(tarjetas.status).toBe(200);
    expect(tarjetas.headers['content-type']).toMatch('application/pdf');
    const pdf = tarjetas.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(2);
    expect(pdf.toString('latin1')).toMatch(/MediaBox \[0 0 612 792\]/); // carta
    const acrilico = await binario(como().get('/mesas/qr.pdf?formato=acrilico'));
    expect(paginas(acrilico.body as Buffer)).toBe(12);
  });

  it('PDF solo con mesas del propio restaurante', async () => {
    await como().post('/mesas/lote').send({ desde: 1, hasta: 2 });
    const propias = await prisma.mesa.findMany({ where: { restauranteId: restauranteA } });
    const ajena = await prisma.mesa.create({
      data: { restauranteId: restauranteB, numero: 1, tokenQr: 'ajena-00000000000000001' },
    });
    const conAjena = await como().get(`/mesas/qr.pdf?ids=${propias[0]!.id},${ajena.id}`);
    expect(conAjena.status).toBe(404);
    const solo = await binario(como().get(`/mesas/qr.pdf?ids=${propias[0]!.id}`));
    expect(solo.status).toBe(200);
    expect(paginas(solo.body as Buffer)).toBe(1);
  });
});

describe('personal: contraseña temporal y último acceso', () => {
  it('restablecer genera una temporal que se debe cambiar al entrar', async () => {
    const mesero = await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteA);
    const res = await como().post(`/usuarios/${mesero.id}/restablecer-password`);
    const temporal = res.body.passwordTemporal as string;
    expect(temporal).toMatch(/^[a-z2-9]{10}$/);

    const vieja = await request(app)
      .post('/auth/login')
      .send({ email: 'mesero@resto-a.test', password: PASSWORD });
    expect(vieja.status).toBe(401);
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'mesero@resto-a.test', password: temporal });
    expect(login.body.usuario.debeCambiarPassword).toBe(true);

    const t = login.body.accessToken;
    const mala = await request(app)
      .post('/auth/cambiar-password')
      .set('Authorization', `Bearer ${t}`)
      .send({ actual: 'x', nueva: 'Nueva123!' });
    expect(mala.status).toBe(400);
    const ok = await request(app)
      .post('/auth/cambiar-password')
      .set('Authorization', `Bearer ${t}`)
      .send({ actual: temporal, nueva: 'Nueva123!' });
    expect(ok.status).toBe(204);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${t}`);
    expect(me.body.usuario.debeCambiarPassword).toBe(false);
  });

  it('el último acceso queda registrado y se ve en la lista del personal', async () => {
    await crearUsuario('caja@resto-a.test', 'CAJA', restauranteA);
    await tokenDe('caja@resto-a.test');
    const lista = (await como().get('/usuarios')).body as {
      email: string;
      ultimoAcceso: string | null;
    }[];
    expect(lista.find((u) => u.email === 'caja@resto-a.test')?.ultimoAcceso).toBeTruthy();
  });

  it('no se puede restablecer la contraseña de personal de otro restaurante', async () => {
    const ajeno = await crearUsuario('mesero@resto-b.test', 'MESERO', restauranteB);
    expect((await como().post(`/usuarios/${ajeno.id}/restablecer-password`)).status).toBe(404);
  });
});
