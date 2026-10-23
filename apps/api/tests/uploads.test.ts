import sharp from 'sharp';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { crearRestaurante, crearUsuario, limpiarBD, sembrarMenu, tokenDe } from './helpers';

let tokenA: string;
let tokenB: string;
let platoA: string;

// Imagen de prueba: rectángulo de color, con orientación EXIF opcional.
const imagen = (ancho: number, alto: number, formato: 'png' | 'jpeg', orientacion?: number) => {
  let img = sharp({ create: { width: ancho, height: alto, channels: 3, background: '#f7a91c' } });
  if (orientacion) img = img.withMetadata({ orientation: orientacion });
  return img[formato]().toBuffer();
};

const subir = (token: string, datos: Buffer, nombre: string, destino = 'plato') =>
  request(app)
    .post(`/uploads/imagen?destino=${destino}`)
    .set('Authorization', `Bearer ${token}`)
    .attach('imagen', datos, { filename: nombre, contentType: 'image/jpeg' });

// URL absoluta → ruta para pedirla a la app (GET /uploads/...).
const ruta = (url: string) => new URL(url).pathname;
const descargar = (url: string) =>
  request(app)
    .get(ruta(url))
    .buffer(true)
    .parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });

beforeAll(async () => {
  await limpiarBD();
  const a = await crearRestaurante('resto-a');
  await crearRestaurante('resto-b');
  platoA = (await sembrarMenu(a.restaurante.id)).casado;
  await crearUsuario('mesero@resto-a.test', 'MESERO', a.restaurante.id);
  tokenA = await tokenDe('dueno@resto-a.test');
  tokenB = await tokenDe('dueno@resto-b.test');
});

describe('POST /uploads/imagen', () => {
  it('genera WebP cuadrados de 320 y 960 px, sin metadatos, en la carpeta del restaurante', async () => {
    const res = await subir(tokenA, await imagen(1600, 900, 'jpeg', 6), 'foto.jpg');
    expect(res.status).toBe(201);
    for (const [url, lado] of [
      [res.body.url320, 320],
      [res.body.url960, 960],
    ] as const) {
      expect(url).toMatch(
        /\/uploads\/restaurantes\/[0-9a-f-]+\/platos\/[0-9a-f-]+-(320|960)\.webp$/,
      );
      const archivo = await descargar(url);
      expect(archivo.status).toBe(200);
      expect(archivo.headers['cross-origin-resource-policy']).toBe('cross-origin');
      const meta = await sharp(archivo.body as Buffer).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: lado, height: lado });
      expect(meta.exif).toBeUndefined();
    }
  });

  it('logo: sin recorte, máximo 512 px y respeta la orientación EXIF', async () => {
    // 1200×600 con orientación 6 (rotada 90°) → queda vertical: 256×512
    const res = await subir(tokenA, await imagen(1200, 600, 'jpeg', 6), 'logo.jpg', 'logo');
    expect(res.status).toBe(201);
    const meta = await sharp((await descargar(res.body.url)).body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 512 });
  });

  it('acepta PNG aunque el nombre o el Content-Type digan otra cosa', async () => {
    expect((await subir(tokenA, await imagen(400, 400, 'png'), 'foto.jpg')).status).toBe(201);
  });

  it('rechaza archivos que no son imagen aunque digan .jpg (415)', async () => {
    const res = await subir(tokenA, Buffer.from('hola, esto es un texto disfrazado'), 'foto.jpg');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('TIPO_NO_SOPORTADO');
  });

  it('un HEIC que no se puede decodificar da un error claro (415)', async () => {
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypheic'),
      Buffer.alloc(64),
    ]);
    const res = await subir(tokenA, heic, 'foto.heic');
    expect(res.status).toBe(415);
    expect(res.body.error.message).toMatch(/JPG o PNG/);
  });

  it('rechaza archivos de más de 8 MB (413)', async () => {
    const res = await subir(tokenA, Buffer.alloc(8 * 1024 * 1024 + 1, 0xff), 'grande.jpg');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('ARCHIVO_GRANDE');
  });

  it('solo el dueño puede subir', async () => {
    const mesero = await tokenDe('mesero@resto-a.test');
    expect((await subir(mesero, await imagen(100, 100, 'png'), 'a.png')).status).toBe(403);
  });
});

describe('borrado de imágenes', () => {
  it('un dueño no puede borrar imágenes de otro restaurante', async () => {
    const { body } = await subir(tokenA, await imagen(300, 300, 'png'), 'a.png');
    const borrar = await request(app)
      .delete('/uploads/imagen')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ url: body.url320 });
    expect(borrar.status).toBe(404);
    expect((await descargar(body.url320)).status).toBe(200);

    // El dueño de A sí puede borrar su imagen descartada.
    const propia = await request(app)
      .delete('/uploads/imagen')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ url: body.url320 });
    expect(propia.status).toBe(204);
    expect((await descargar(body.url320)).status).not.toBe(200);
  });

  it('al reemplazar o quitar la foto de un plato se borran los archivos viejos', async () => {
    const vieja = (await subir(tokenA, await imagen(300, 300, 'png'), 'v.png')).body;
    const nueva = (await subir(tokenA, await imagen(300, 300, 'png'), 'n.png')).body;
    const patch = (body: object) =>
      request(app).patch(`/platos/${platoA}`).set('Authorization', `Bearer ${tokenA}`).send(body);

    await patch({ fotoUrl: vieja.url960, fotoMiniUrl: vieja.url320 });
    // En uso: no se puede borrar suelta.
    const enUso = await request(app)
      .delete('/uploads/imagen')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ url: vieja.url960 });
    expect(enUso.status).toBe(409);

    await patch({ fotoUrl: nueva.url960, fotoMiniUrl: nueva.url320 });
    expect((await descargar(vieja.url960)).status).not.toBe(200);
    expect((await descargar(vieja.url320)).status).not.toBe(200);
    expect((await descargar(nueva.url960)).status).toBe(200);

    await patch({ fotoUrl: null, fotoMiniUrl: null });
    expect((await descargar(nueva.url960)).status).not.toBe(200);
  });

  it('una URL que apunta a otro restaurante en un plato propio no borra el archivo ajeno', async () => {
    const ajena = (await subir(tokenB, await imagen(300, 300, 'png'), 'b.png')).body;
    const patch = (body: object) =>
      request(app).patch(`/platos/${platoA}`).set('Authorization', `Bearer ${tokenA}`).send(body);
    await patch({ fotoUrl: ajena.url960 });
    await patch({ fotoUrl: null });
    expect((await descargar(ajena.url960)).status).toBe(200);
  });
});

describe('personalización: banner y datos que ve el cliente', () => {
  const restaurante = (body: object) =>
    request(app).patch('/restaurante').set('Authorization', `Bearer ${tokenA}`).send(body);

  it('el banner se guarda en 1600×600 y al cambiarlo se borra el anterior', async () => {
    const r = await subir(tokenA, await imagen(3000, 2000, 'jpeg'), 'portada.jpg', 'banner');
    expect(r.status).toBe(201);
    const meta = await sharp((await descargar(r.body.url)).body as Buffer).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1600, 600, 'webp']);
    await restaurante({ bannerUrl: r.body.url });
    const otro = await subir(tokenA, await imagen(1600, 600, 'png'), 'otra.png', 'banner');
    await restaurante({ bannerUrl: otro.body.url });
    expect((await descargar(r.body.url)).status).not.toBe(200);
    expect((await descargar(otro.body.url)).status).toBe(200);
  });

  it('eslogan, dirección y enlace de Google Maps llegan al menú público', async () => {
    expect((await restaurante({ ubicacionUrl: 'https://evil.com/maps' })).status).toBe(400);
    expect((await restaurante({ telefono: '12' })).status).toBe(400);
    const ok = await restaurante({
      eslogan: 'La sazón de siempre',
      telefono: '2222 3333',
      direccion: 'Barrio Escalante, San José',
      ubicacionUrl: 'https://maps.app.goo.gl/abc123',
    });
    expect(ok.status).toBe(200);
    const menu = (await request(app).get('/public/resto-a/menu')).body;
    expect(menu.restaurante).toMatchObject({
      eslogan: 'La sazón de siempre',
      telefono: '2222 3333',
      direccion: 'Barrio Escalante, San José',
      ubicacionUrl: 'https://maps.app.goo.gl/abc123',
    });
  });
});
