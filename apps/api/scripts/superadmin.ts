// Crea o actualiza el superadministrador real (dueño de la plataforma). Las credenciales se pasan
// al correrlo y nunca quedan en el código:
//   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... pnpm --filter api superadmin
import bcrypt from 'bcryptjs';
import { loginSchema } from '@menu-qr/shared';
import { prisma } from '../src/lib/prisma';

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? '';
  if (!loginSchema.safeParse({ email, password }).success || password.length < 8) {
    console.error('Faltan SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD (8 caracteres o más).');
    process.exit(1);
  }
  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe && existe.rol !== 'SUPERADMIN') {
    console.error(`${email} ya es usuario de un restaurante; use otro correo.`);
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.usuario.upsert({
    where: { email },
    update: { passwordHash, activo: true },
    create: { nombre: 'Superadmin', email: email!, passwordHash, rol: 'SUPERADMIN' },
  });
  console.log(`Superadmin listo: ${email}`);
}

main().finally(() => prisma.$disconnect());
