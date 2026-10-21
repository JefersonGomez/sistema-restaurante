import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { autenticar } from '../src/middlewares/auth';
import { errorHandler } from '../src/middlewares/errorHandler';
import { requireRole } from '../src/middlewares/roles';
import { tenant } from '../src/middlewares/tenant';
import { crearRestaurante, crearUsuario, limpiarBD, tokenDe } from './helpers';

// Mini app con una ruta privada de prueba: solo DUENO, con tenant.
const prueba = express();
prueba.use(express.json());
prueba.post('/privada', autenticar, requireRole('DUENO'), tenant, (req, res) => {
  res.json({ restauranteId: req.tenant!.restauranteId });
});
prueba.use(errorHandler);

let restauranteId: string;
let tokenDueno: string;
let tokenMesero: string;
let tokenSuperadmin: string;

beforeAll(async () => {
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  restauranteId = restaurante.id;
  await crearUsuario('mesero@resto-a.test', 'MESERO', restauranteId);
  await crearUsuario('admin@x.test', 'SUPERADMIN', null);
  tokenDueno = await tokenDe('dueno@resto-a.test');
  tokenMesero = await tokenDe('mesero@resto-a.test');
  tokenSuperadmin = await tokenDe('admin@x.test');
});

describe('autenticar + requireRole + tenant', () => {
  it('sin token → 401', async () => {
    const res = await request(prueba).post('/privada');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('rol incorrecto → 403', async () => {
    const res = await request(prueba)
      .post('/privada')
      .set('Authorization', `Bearer ${tokenMesero}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROHIBIDO');
  });

  it('rol correcto → 200 con el restauranteId del JWT', async () => {
    const res = await request(prueba).post('/privada').set('Authorization', `Bearer ${tokenDueno}`);
    expect(res.status).toBe(200);
    expect(res.body.restauranteId).toBe(restauranteId);
  });

  it('ignora un restauranteId enviado en body o query', async () => {
    const otro = '00000000-0000-0000-0000-000000000000';
    const res = await request(prueba)
      .post(`/privada?restauranteId=${otro}`)
      .set('Authorization', `Bearer ${tokenDueno}`)
      .send({ restauranteId: otro });
    expect(res.body.restauranteId).toBe(restauranteId);
  });

  it('usuario sin restaurante (superadmin) no pasa el tenant → 403', async () => {
    const soloTenant = express();
    soloTenant.get('/x', autenticar, tenant, (_req, res) => res.end());
    soloTenant.use(errorHandler);
    const res = await request(soloTenant)
      .get('/x')
      .set('Authorization', `Bearer ${tokenSuperadmin}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SIN_RESTAURANTE');
  });
});

describe('cabeceras de seguridad', () => {
  it('helmet agrega cabeceras', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS permite solo los orígenes del .env', async () => {
    const ok = await request(app).get('/no-existe').set('Origin', 'http://localhost:5181');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5181');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const malo = await request(app).get('/no-existe').set('Origin', 'http://evil.test');
    expect(malo.headers['access-control-allow-origin']).toBeUndefined();
  });
});
