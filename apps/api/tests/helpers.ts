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
