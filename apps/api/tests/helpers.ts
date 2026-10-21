import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Rol } from '@menu-qr/shared';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const PASSWORD = 'Clave123!';
const hash = bcrypt.hashSync(PASSWORD, 4);

export async function limpiarBD() {
  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const lista = tablas.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${lista} CASCADE`);
}

export async function crearUsuario(email: string, rol: Rol, restauranteId: string | null) {
  return prisma.usuario.create({
    data: { email, rol, restauranteId, nombre: email, passwordHash: hash },
  });
}

export async function crearRestaurante(slug: string) {
  const restaurante = await prisma.restaurante.create({ data: { nombre: slug, slug } });
  const dueno = await crearUsuario(`dueno@${slug}.test`, 'DUENO', restaurante.id);
  return { restaurante, dueno };
}

export async function tokenDe(email: string) {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login falló para ${email}: ${res.status}`);
  return res.body.accessToken as string;
}

// Menú mínimo para probar pedidos: casado (cocina) con término obligatorio y extras (0–2),
// refresco (bar) sin modificadores, un plato agotado, uno inactivo y dos mesas.
export async function sembrarMenu(restauranteId: string) {
  const cocina = await prisma.estacion.create({ data: { restauranteId, nombre: 'Cocina' } });
  const bar = await prisma.estacion.create({ data: { restauranteId, nombre: 'Bar' } });
  const categoria = await prisma.categoria.create({
    data: { restauranteId, nombreEs: 'Todo', nombreEn: 'All' },
  });
  const plato = (estacionId: string, nombreEs: string, precio: number, extra = {}) =>
    prisma.plato.create({
      data: {
        restauranteId,
        categoriaId: categoria.id,
        estacionId,
        nombreEs,
        nombreEn: nombreEs,
        precio,
        ...extra,
      },
    });
  const casado = await plato(cocina.id, 'Casado', 480000);
  const termino = await prisma.grupoModificadores.create({
    data: {
      restauranteId,
      platoId: casado.id,
      nombreEs: 'Término',
      nombreEn: 'Doneness',
      obligatorio: true,
      minimo: 1,
      maximo: 1,
      modificadores: {
        create: [
          { restauranteId, nombreEs: 'Medio', nombreEn: 'Medium' },
          { restauranteId, nombreEs: 'Bien cocido', nombreEn: 'Well done' },
        ],
      },
    },
    include: { modificadores: true },
  });
  const extras = await prisma.grupoModificadores.create({
    data: {
      restauranteId,
      platoId: casado.id,
      nombreEs: 'Extras',
      nombreEn: 'Extras',
      minimo: 0,
      maximo: 2,
      modificadores: {
        create: [
          { restauranteId, nombreEs: 'Huevo', nombreEn: 'Egg', precioExtra: 50000 },
          { restauranteId, nombreEs: 'Aguacate', nombreEn: 'Avocado', precioExtra: 80000 },
          { restauranteId, nombreEs: 'Queso', nombreEn: 'Cheese', precioExtra: 60000 },
        ],
      },
    },
    include: { modificadores: true },
  });
  const refresco = await plato(bar.id, 'Refresco', 150000);
  const agotado = await plato(cocina.id, 'Agotado', 100000, { agotado: true });
  const inactivo = await plato(cocina.id, 'Inactivo', 100000, { activo: false });
  const mesa = await prisma.mesa.create({
    data: { restauranteId, numero: 1, tokenQr: `qr-${restauranteId}-mesa-1` },
  });
  const mesa2 = await prisma.mesa.create({
    data: { restauranteId, numero: 2, tokenQr: `qr-${restauranteId}-mesa-2` },
  });
  return {
    estaciones: { cocina: cocina.id, bar: bar.id },
    casado: casado.id,
    termino: termino.modificadores.map((m) => m.id),
    extras: extras.modificadores.map((m) => m.id),
    refresco: refresco.id,
    agotado: agotado.id,
    inactivo: inactivo.id,
    mesa,
    mesa2,
  };
}

export async function abrirSesion(tokenQr: string) {
  const res = await request(app).get(`/public/mesa/${tokenQr}`);
  if (res.status !== 200) throw new Error(`abrir sesión: ${res.status}`);
  return res.body as { token: string; cuentaId: string };
}

let contador = 0;
export const nuevoRequestId = () => `req-${Date.now()}-${++contador}`;
