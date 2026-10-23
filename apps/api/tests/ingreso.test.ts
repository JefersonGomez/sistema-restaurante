import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { crearRestaurante, limpiarBD, sembrarMenu } from './helpers';

let m: Awaited<ReturnType<typeof sembrarMenu>>;
let mb: Awaited<ReturnType<typeof sembrarMenu>>;

const escanear = (tokenQr: string) => request(app).get(`/public/mesa/${tokenQr}`);
const conSesion = (token: string) => ({
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${token}`),
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${token}`),
});
// Mesa con 2 personas ya dentro (cupo lleno).
async function mesaLlena() {
  const primero = (await escanear(m.mesa.tokenQr)).body;
  expect(primero.personas).toBeNull();
  await conSesion(primero.token).post('/public/cuenta/personas').send({ personas: 2 });
  const segundo = (await escanear(m.mesa.tokenQr)).body;
  expect(segundo.personas).toBe(2);
  return { primero, segundo };
}
const pedirIngreso = async () => {
  const r = await request(app).post(`/public/mesa/${m.mesa.tokenQr}/ingreso`);
  return r;
};
const estado = (id: string, clave: string) =>
  request(app).post(`/public/mesa/${m.mesa.tokenQr}/ingreso/${id}`).send({ clave });

beforeEach(async () => {
  await limpiarBD();
  m = await sembrarMenu((await crearRestaurante('resto-a')).restaurante.id);
  mb = await sembrarMenu((await crearRestaurante('resto-b')).restaurante.id);
});

describe('personas por mesa', () => {
  it('el primero dice cuántos son; con el cupo lleno no se entra directo', async () => {
    await mesaLlena();
    const tercero = await escanear(m.mesa.tokenQr);
    expect(tercero.status).toBe(409);
    expect(tercero.body.error).toMatchObject({
      code: 'MESA_LLENA',
      details: { numero: 1, personas: 2, bloqueada: false },
    });
    // No se creó una sesión para el tercero.
    expect(await prisma.sesionCliente.count()).toBe(2);
  });

  it('aceptar: el nuevo recibe su sesión una sola vez y el cupo sube', async () => {
    const { primero } = await mesaLlena();
    const s = (await pedirIngreso()).body;
    expect((await estado(s.id, s.clave)).body.estado).toBe('PENDIENTE');

    const r = await conSesion(primero.token)
      .post(`/public/cuenta/ingresos/${s.id}`)
      .send({ aceptar: true });
    expect(r.body.estado).toBe('ACEPTADA');
    const entrada = (await estado(s.id, s.clave)).body;
    expect(entrada.estado).toBe('ACEPTADA');
    const cuenta = await conSesion(entrada.token).get('/public/cuenta');
    expect(cuenta.status).toBe(200);
    expect(cuenta.body.personas).toBe(3);
    // La sesión no se entrega dos veces, ni con una clave equivocada.
    expect((await estado(s.id, s.clave)).status).toBe(404);
    expect((await estado(s.id, 'x'.repeat(43))).status).toBe(404);
    // Ya no se puede volver a responder.
    expect(
      (
        await conSesion(primero.token)
          .post(`/public/cuenta/ingresos/${s.id}`)
          .send({ aceptar: false })
      ).status,
    ).toBe(409);
  });

  it('3 rechazos bloquean la mesa; los de la mesa la pueden desbloquear', async () => {
    const { segundo } = await mesaLlena();
    for (let i = 0; i < 3; i++) {
      const s = (await pedirIngreso()).body;
      await conSesion(segundo.token)
        .post(`/public/cuenta/ingresos/${s.id}`)
        .send({ aceptar: false });
      expect((await estado(s.id, s.clave)).body.estado).toBe('RECHAZADA');
    }
    const bloqueada = await pedirIngreso();
    expect(bloqueada.status).toBe(423);
    expect((await escanear(m.mesa.tokenQr)).body.error.details.bloqueada).toBe(true);
    expect((await conSesion(segundo.token).get('/public/cuenta')).body.ingresoBloqueado).toBe(true);

    await conSesion(segundo.token).post('/public/cuenta/desbloquear-ingreso');
    expect((await pedirIngreso()).status).toBe(201);
  });

  it('muchos intentos seguidos también bloquean (spam)', async () => {
    await mesaLlena();
    for (let i = 0; i < 5; i++) expect((await pedirIngreso()).status).toBe(201);
    expect((await pedirIngreso()).status).toBe(423);
  });

  it('una solicitud vencida no se puede aceptar; otra mesa no la puede responder', async () => {
    const { primero } = await mesaLlena();
    const s = (await pedirIngreso()).body;
    const ajena = (await escanear(mb.mesa.tokenQr)).body;
    expect(
      (await conSesion(ajena.token).post(`/public/cuenta/ingresos/${s.id}`).send({ aceptar: true }))
        .status,
    ).toBe(409);
    await prisma.solicitudIngreso.update({
      where: { id: s.id },
      data: { expiraEn: new Date(Date.now() - 1000) },
    });
    expect((await estado(s.id, s.clave)).body.estado).toBe('VENCIDA');
    expect(
      (
        await conSesion(primero.token)
          .post(`/public/cuenta/ingresos/${s.id}`)
          .send({ aceptar: true })
      ).status,
    ).toBe(409);
  });

  it('valida la cantidad de personas', async () => {
    const primero = (await escanear(m.mesa.tokenQr)).body;
    for (const personas of [0, 31, 2.5])
      expect(
        (await conSesion(primero.token).post('/public/cuenta/personas').send({ personas })).status,
      ).toBe(400);
  });
});
