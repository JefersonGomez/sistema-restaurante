import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { textoWifi } from '../src/modules/mesas/mesas.service';
import { crearRestaurante, limpiarBD, sembrarMenu, tokenDe } from './helpers';

let token: string;
const como = () => ({
  get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${token}`),
  patch: (u: string) => request(app).patch(u).set('Authorization', `Bearer ${token}`),
  post: (u: string) => request(app).post(u).set('Authorization', `Bearer ${token}`),
});
const binario = (r: request.Test) =>
  r.buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (c: Buffer) => partes.push(c));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  });

beforeEach(async () => {
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  await sembrarMenu(restaurante.id);
  token = await tokenDe('dueno@resto-a.test');
});

describe('sin internet: Wi-Fi en las tarjetas y menú impreso', () => {
  it('el texto del QR de Wi-Fi escapa los caracteres especiales', () => {
    expect(textoWifi('Soda La Esquina', 'clave;123')).toBe(
      'WIFI:T:WPA;S:Soda La Esquina;P:clave\\;123;;',
    );
    expect(textoWifi('Invitados', null)).toBe('WIFI:T:nopass;S:Invitados;;');
  });

  it('el dueño guarda su Wi-Fi y el PDF de mesas sale igual', async () => {
    const r = await como()
      .patch('/restaurante')
      .send({ wifiNombre: 'Soda', wifiClave: 'abc12345' });
    expect(r.body).toMatchObject({ wifiNombre: 'Soda', wifiClave: 'abc12345' });
    expect(
      (
        await como()
          .patch('/restaurante')
          .send({ wifiNombre: 'x'.repeat(40) })
      ).status,
    ).toBe(400);
    const pdf = await binario(como().get('/mesas/qr.pdf'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch('application/pdf');
  });

  it('menú en PDF para imprimir (solo el dueño)', async () => {
    const pdf = await binario(como().get('/restaurante/menu.pdf'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    expect((await request(app).get('/restaurante/menu.pdf')).status).toBe(401);
  });
});
