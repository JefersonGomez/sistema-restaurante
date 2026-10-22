import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { crearRestaurante, crearUsuario, limpiarBD, PASSWORD, tokenDe } from './helpers';

let dueno: string;
let mesero: string;
let cocina: string;
let caja: string;
let superadmin: string;

const como = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
  patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
  delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
});

beforeAll(async () => {
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  await crearUsuario('mesero@resto-a.test', 'MESERO', restaurante.id);
  await crearUsuario('cocina@resto-a.test', 'COCINA', restaurante.id);
  await crearUsuario('caja@resto-a.test', 'CAJA', restaurante.id);
  await crearUsuario('admin@x.test', 'SUPERADMIN', null);
  dueno = await tokenDe('dueno@resto-a.test');
  mesero = await tokenDe('mesero@resto-a.test');
  cocina = await tokenDe('cocina@resto-a.test');
  caja = await tokenDe('caja@resto-a.test');
  superadmin = await tokenDe('admin@x.test');
});

describe('rutas protegidas', () => {
  const rutas = ['/restaurante', '/usuarios', '/estaciones', '/categorias', '/platos', '/mesas'];

  it('sin token → 401', async () => {
    for (const r of [...rutas, '/admin/restaurantes'])
      expect((await request(app).get(r)).status, r).toBe(401);
  });

  it('rol incorrecto → 403', async () => {
    for (const r of rutas) expect((await como(caja).get(r)).status, r).toBe(403);
    expect((await como(mesero).get('/mesas')).status).toBe(403);
    expect((await como(mesero).post('/platos')).status).toBe(403);
    expect((await como(dueno).get('/admin/restaurantes')).status).toBe(403);
    expect((await como(superadmin).get('/platos')).status).toBe(403);
  });
});

describe('superadmin', () => {
  it('crea un restaurante con su dueño, lista y desactiva', async () => {
    const crear = await como(superadmin)
      .post('/admin/restaurantes')
      .send({
        restaurante: { nombre: 'Soda Nueva', slug: 'soda-nueva' },
        dueno: { nombre: 'Ana', email: 'ana@soda-nueva.test', password: PASSWORD },
      });
    expect(crear.status).toBe(201);
    expect(crear.body.usuarios[0]).toMatchObject({ rol: 'DUENO', email: 'ana@soda-nueva.test' });
    expect(crear.body.usuarios[0].passwordHash).toBeUndefined();

    const repetido = await como(superadmin)
      .post('/admin/restaurantes')
      .send({
        restaurante: { nombre: 'Otra', slug: 'soda-nueva' },
        dueno: { nombre: 'B', email: 'b@x.test', password: PASSWORD },
      });
    expect(repetido.status).toBe(409);

    const lista = await como(superadmin).get('/admin/restaurantes');
    expect(lista.body.map((r: { slug: string }) => r.slug)).toContain('soda-nueva');

    const id = crear.body.id;
    const patch = await como(superadmin)
      .patch(`/admin/restaurantes/${id}`)
      .send({ activo: false, plan: 'pro' });
    expect(patch.body).toMatchObject({ activo: false, plan: 'pro' });

    // El dueño de un restaurante desactivado ya no puede entrar.
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'ana@soda-nueva.test', password: PASSWORD });
    expect(login.status).toBe(401);
  });
});

describe('dueño', () => {
  it('lee y actualiza la configuración de su restaurante (sin tocar slug ni plan)', async () => {
    const res = await como(dueno)
      .patch('/restaurante')
      .send({ colorPrimario: '#123456', porcentajeIva: 13, slug: 'otro', plan: 'gratis' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ colorPrimario: '#123456', slug: 'resto-a', plan: 'basico' });
    expect((await como(dueno).patch('/restaurante').send({ colorPrimario: 'rojo' })).status).toBe(
      400,
    );
  });

  it('gestiona usuarios y no puede auto-desactivarse', async () => {
    const crear = await como(dueno)
      .post('/usuarios')
      .send({ nombre: 'Nuevo', email: 'nuevo@resto-a.test', password: PASSWORD, rol: 'MESERO' });
    expect(crear.status).toBe(201);
    expect(crear.body.passwordHash).toBeUndefined();

    const superadminNo = await como(dueno)
      .post('/usuarios')
      .send({ nombre: 'X', email: 'x@resto-a.test', password: PASSWORD, rol: 'SUPERADMIN' });
    expect(superadminNo.status).toBe(400);

    const yo = (await como(dueno).get('/auth/me')).body.usuario.id;
    expect((await como(dueno).patch(`/usuarios/${yo}`).send({ activo: false })).status).toBe(400);
    expect((await como(dueno).delete(`/usuarios/${yo}`)).status).toBe(400);

    expect((await como(dueno).delete(`/usuarios/${crear.body.id}`)).status).toBe(204);
  });

  it('crea estación, categoría, plato con modificadores y lo ve en el menú público', async () => {
    const estacion = await como(dueno).post('/estaciones').send({ nombre: 'Cocina' });
    const cat = await como(dueno)
      .post('/categorias')
      .send({ nombreEs: 'Fuertes', nombreEn: 'Mains' });
    const plato = await como(dueno)
      .post('/platos')
      .send({
        categoriaId: cat.body.id,
        estacionId: estacion.body.id,
        nombreEs: 'Casado',
        nombreEn: 'Casado',
        precio: 480000,
        alergenos: ['gluten'],
      });
    expect(plato.status).toBe(201);
    expect(plato.body.precio).toBe(480000);

    const precioFloat = await como(dueno).patch(`/platos/${plato.body.id}`).send({ precio: 12.5 });
    expect(precioFloat.status).toBe(400);

    const grupo = await como(dueno)
      .post(`/platos/${plato.body.id}/grupos-modificadores`)
      .send({ nombreEs: 'Término', nombreEn: 'Doneness', obligatorio: true });
    expect(grupo.status).toBe(201);
    expect(grupo.body).toMatchObject({ minimo: 1, maximo: 1 });

    const malGrupo = await como(dueno)
      .patch(`/platos/${plato.body.id}/grupos-modificadores/${grupo.body.id}`)
      .send({ minimo: 3 });
    expect(malGrupo.status).toBe(400);

    const mod = await como(dueno)
      .post(`/platos/${plato.body.id}/grupos-modificadores/${grupo.body.id}/modificadores`)
      .send({ nombreEs: 'Medio', nombreEn: 'Medium', precioExtra: 0 });
    expect(mod.status).toBe(201);

    const detalle = await como(dueno).get(`/platos/${plato.body.id}`);
    expect(detalle.body.grupos[0].modificadores).toHaveLength(1);

    const menu = await request(app).get('/public/resto-a/menu');
    expect(menu.status).toBe(200);
    const platoPublico = menu.body.categorias[0].platos[0];
    expect(platoPublico).toMatchObject({ nombreEs: 'Casado', precio: 480000 });
    expect(platoPublico.grupos[0].modificadores[0].nombreEn).toBe('Medium');

    // Categoría con platos no se puede borrar.
    expect((await como(dueno).delete(`/categorias/${cat.body.id}`)).status).toBe(409);
  });

  it('mesero y cocina pueden marcar agotado; caja no', async () => {
    const [plato] = (await como(dueno).get('/platos')).body;
    expect(
      (await como(mesero).patch(`/platos/${plato.id}/agotado`).send({ agotado: true })).body
        .agotado,
    ).toBe(true);
    expect(
      (await como(cocina).patch(`/platos/${plato.id}/agotado`).send({ agotado: false })).status,
    ).toBe(200);
    expect(
      (await como(caja).patch(`/platos/${plato.id}/agotado`).send({ agotado: true })).status,
    ).toBe(403);
  });

  it('reordena categorías', async () => {
    const c1 = await como(dueno).post('/categorias').send({ nombreEs: 'A', nombreEn: 'A' });
    const c2 = await como(dueno).post('/categorias').send({ nombreEs: 'B', nombreEn: 'B' });
    const res = await como(dueno)
      .patch('/categorias/orden')
      .send({ ids: [c2.body.id, c1.body.id] });
    expect(res.status).toBe(200);
    const orden = res.body.map((c: { id: string }) => c.id);
    expect(orden.indexOf(c2.body.id)).toBeLessThan(orden.indexOf(c1.body.id));
  });

  it('mesas: crear, número repetido, QR png/svg y regenerar token', async () => {
    const mesa = await como(dueno).post('/mesas').send({ numero: 7, nombre: 'Terraza' });
    expect(mesa.status).toBe(201);
    expect(mesa.body.tokenQr.length).toBeGreaterThanOrEqual(32);
    expect((await como(dueno).post('/mesas').send({ numero: 7 })).status).toBe(409);

    const png = await como(dueno).get(`/mesas/${mesa.body.id}/qr`);
    expect(png.headers['content-type']).toMatch('image/png');
    const svg = await como(dueno).get(`/mesas/${mesa.body.id}/qr?formato=svg`);
    expect(svg.headers['content-type']).toMatch('image/svg+xml');
    expect((await como(dueno).get(`/mesas/${mesa.body.id}/qr?formato=gif`)).status).toBe(400);

    const nuevo = await como(dueno).post(`/mesas/${mesa.body.id}/regenerar-token`);
    expect(nuevo.body.tokenQr).not.toBe(mesa.body.tokenQr);
    expect((await request(app).get(`/public/mesa/${mesa.body.tokenQr}`)).status).toBe(404);
    expect((await request(app).get(`/public/mesa/${nuevo.body.tokenQr}`)).status).toBe(200);
  });

  it('id con formato inválido → 400', async () => {
    expect((await como(dueno).get('/platos/no-es-uuid')).status).toBe(400);
  });
});
