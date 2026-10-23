import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { fechaLocal, momentoLocal, type MenuPublico } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';
import {
  abrirSesion,
  crearRestaurante,
  limpiarBD,
  nuevoRequestId,
  sembrarMenu,
  tokenDe,
} from './helpers';

const ZONA = 'America/Costa_Rica';
let m: Awaited<ReturnType<typeof sembrarMenu>>;
let dueno: string;
let categoriaId: string;

const crearPlato = (extra: object) =>
  request(app)
    .post('/platos')
    .set('Authorization', `Bearer ${dueno}`)
    .send({
      categoriaId,
      estacionId: m.estaciones.cocina,
      nombreEs: 'Almuerzo del día',
      nombreEn: 'Lunch of the day',
      descripcionEs: 'Sopa de pollo + casado con chuleta + fresco',
      precio: 450000,
      menuDelDia: true,
      ...extra,
    });
const menu = async () => (await request(app).get('/public/resto-a/menu')).body as MenuPublico;

beforeEach(async () => {
  await limpiarBD();
  const { restaurante } = await crearRestaurante('resto-a');
  m = await sembrarMenu(restaurante.id);
  // Abierto siempre (si no, el pedido rebotaría por horario).
  await prisma.horarioRestaurante.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      restauranteId: restaurante.id,
      diaSemana,
      abre: '00:00',
      cierra: '23:59',
    })),
  });
  await prisma.restaurante.update({
    where: { id: restaurante.id },
    data: { modoConfirmacion: 'NUNCA' },
  });
  categoriaId = (
    await prisma.categoria.findFirstOrThrow({ where: { restauranteId: restaurante.id } })
  ).id;
  dueno = await tokenDe('dueno@resto-a.test');
});

describe('menús del día', () => {
  it('solo se ofrecen el día programado (semana o fecha) y salen de su categoría', async () => {
    const hoy = momentoLocal(new Date(), ZONA).diaSemana;
    const deHoy = (await crearPlato({ diasSemana: [hoy] })).body;
    const deManana = (await crearPlato({ nombreEs: 'Otro', diasSemana: [(hoy + 1) % 7] })).body;
    const aMano = (
      await crearPlato({
        nombreEs: 'Especial',
        diasSemana: [],
        fechaMenu: fechaLocal(new Date(), ZONA),
      })
    ).body;

    const r = await menu();
    expect(r.menuDelDia.map((p) => p.id).sort()).toEqual([deHoy.id, aMano.id].sort());
    expect(r.menuDelDia[0]!.icono).toBeDefined();
    const enCategorias = r.categorias.flatMap((c) => c.platos.map((p) => p.id));
    expect(enCategorias).not.toContain(deHoy.id);
    expect(enCategorias).not.toContain(deManana.id);
    expect(enCategorias).toContain(m.casado); // los platos normales siguen igual
  });

  it('pedir un menú del día que no es de hoy → 409; el de hoy se cobra a su precio', async () => {
    const hoy = momentoLocal(new Date(), ZONA).diaSemana;
    const deHoy = (await crearPlato({ diasSemana: [hoy] })).body;
    const otro = (await crearPlato({ nombreEs: 'Otro', diasSemana: [(hoy + 3) % 7] })).body;
    const s = await abrirSesion(m.mesa.tokenQr);
    const pedir = (platoId: string) =>
      request(app)
        .post('/public/cuenta/pedidos')
        .set('Authorization', `Bearer ${s.token}`)
        .send({ clientRequestId: nuevoRequestId(), items: [{ platoId, cantidad: 1 }] });
    const no = await pedir(otro.id);
    expect(no.status).toBe(409);
    expect(no.body.error.details.motivo).toBe('no_es_hoy');
    const si = await pedir(deHoy.id);
    expect(si.status).toBe(201);
    expect(si.body.items[0].precioUnitario).toBe(450000);
  });

  it('valida días y fecha', async () => {
    expect((await crearPlato({ diasSemana: [7] })).status).toBe(400);
    expect((await crearPlato({ fechaMenu: 'mañana' })).status).toBe(400);
    const p = (await crearPlato({ diasSemana: [1, 3], fechaMenu: '2026-12-24' })).body;
    expect(p.diasSemana).toEqual([1, 3]);
    expect(p.fechaMenu.slice(0, 10)).toBe('2026-12-24');
  });
});
