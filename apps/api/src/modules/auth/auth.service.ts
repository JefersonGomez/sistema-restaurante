import bcrypt from 'bcryptjs';
import type { LoginInput, RegistroInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import {
  firmarAccessToken,
  generarRefreshToken,
  hashToken,
  type UsuarioToken,
} from '../../lib/tokens';
import { HttpError } from '../../middlewares/errorHandler';
import { finPrueba } from '../restaurantes/restaurantes.service';

// Se compara contra este hash cuando el email no existe, para no revelar qué emails existen.
const HASH_RELLENO = bcrypt.hashSync('relleno', 10);

export const usuarioPublico = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  restauranteId: true,
  debeCambiarPassword: true,
  restaurante: { select: { id: true, nombre: true, slug: true, plan: true, esDemo: true } },
} as const;

const conRestaurante = {
  restaurante: { select: { activo: true, suspendidoPorPago: true } },
} as const;

// Usuario inactivo o de un restaurante desactivado no puede entrar.
const puedeEntrar = (u: { activo: boolean; restaurante: { activo: boolean } | null }) =>
  u.activo && (u.restaurante?.activo ?? true);

export async function emitirTokens({ id, rol, restauranteId }: Omit<UsuarioToken, 'estacionId'>) {
  const u = { id, rol, restauranteId };
  const refreshToken = generarRefreshToken();
  await prisma.refreshToken.create({
    data: {
      usuarioId: u.id,
      tokenHash: hashToken(refreshToken),
      expiraEn: new Date(Date.now() + env.JWT_REFRESH_TTL_DIAS * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken: firmarAccessToken(u), refreshToken };
}

export async function login({ email, password }: LoginInput) {
  const u = await prisma.usuario.findUnique({ where: { email }, include: conRestaurante });
  const ok = await bcrypt.compare(password, u?.passwordHash ?? HASH_RELLENO);
  // Con la contraseña correcta se explica por qué no entra si el plan venció.
  if (u && ok && u.activo && u.restaurante?.suspendidoPorPago && !u.restaurante.activo)
    throw new HttpError(
      403,
      'PLAN_VENCIDO',
      'El plan de su restaurante venció y el servicio está suspendido. Escríbanos para pagar y reactivarlo.',
    );
  if (!u || !ok || !puedeEntrar(u))
    throw new HttpError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos');

  await prisma.usuario.update({ where: { id: u.id }, data: { ultimoAcceso: new Date() } });
  const tokens = await emitirTokens(u);
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: u.id },
    select: usuarioPublico,
  });
  return { ...tokens, usuario };
}

// Rota el refresh token: el usado se revoca y se emite uno nuevo.
export async function refrescar(refreshToken: string | undefined) {
  const invalido = new HttpError(401, 'REFRESH_INVALIDO', 'Sesión expirada');
  if (!refreshToken) throw invalido;

  const guardado = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { usuario: { include: conRestaurante } },
  });
  if (!guardado) throw invalido;
  if (guardado.revocado) {
    // Reuso de un token ya rotado (posible robo): se cierran todas las sesiones del usuario.
    await prisma.refreshToken.updateMany({
      where: { usuarioId: guardado.usuarioId },
      data: { revocado: true },
    });
    throw invalido;
  }
  if (guardado.expiraEn < new Date() || !puedeEntrar(guardado.usuario)) throw invalido;

  // El filtro revocado:false evita que dos refresh simultáneos usen el mismo token.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: guardado.id, revocado: false },
    data: { revocado: true },
  });
  if (count === 0) throw invalido;
  return emitirTokens(guardado.usuario);
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken) },
    data: { revocado: true },
  });
}

// El usuario cambia su propia contraseña (obligatorio si el dueño le dio una temporal).
export async function cambiarPassword(usuarioId: string, actual: string, nueva: string) {
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  if (!(await bcrypt.compare(actual, u.passwordHash)))
    throw new HttpError(400, 'PASSWORD_INCORRECTA', 'La contraseña actual no es correcta');
  if (actual === nueva)
    throw new HttpError(400, 'PASSWORD_REPETIDA', 'La nueva contraseña tiene que ser distinta');
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash: await bcrypt.hash(nueva, 10), debeCambiarPassword: false },
  });
}

// "Soda La Esquina" → "soda-la-esquina" (sin tildes); si ya existe, se le agrega -2, -3…
export const slugDe = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'restaurante';

async function slugLibre(nombre: string) {
  const base = slugDe(nombre);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await prisma.restaurante.findUnique({ where: { slug }, select: { id: true } })))
      return slug;
  }
}

// Registro público: crea el restaurante (activo), su dueño, las estaciones Cocina y Bar y un
// horario inicial de todos los días 7:00–21:00 (para que el menú no salga "Cerrado"); el dueño
// queda con la sesión iniciada.
export async function registrar({ restaurante, dueno }: RegistroInput) {
  if (await prisma.usuario.findUnique({ where: { email: dueno.email }, select: { id: true } }))
    throw new HttpError(409, 'CORREO_EN_USO', 'Ya hay una cuenta con ese correo; entre con él');
  const passwordHash = await bcrypt.hash(dueno.password, 10);
  await prisma.restaurante.create({
    data: {
      nombre: restaurante.nombre,
      slug: await slugLibre(restaurante.nombre),
      plan: restaurante.plan ?? 'COMPLETO', // mes de prueba del plan elegido (Completo por defecto)
      vieneDeDemo: restaurante.vieneDeDemo ?? false,
      planVenceEn: finPrueba(),
      telefono: restaurante.telefono,
      direccion: restaurante.direccion || null,
      usuarios: {
        create: { nombre: dueno.nombre, email: dueno.email, passwordHash, rol: 'DUENO' },
      },
      estaciones: { create: [{ nombre: 'Cocina' }, { nombre: 'Bar' }] },
      horarios: {
        create: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
          diaSemana,
          abre: '07:00',
          cierra: '21:00',
        })),
      },
    },
  });
  return login({ email: dueno.email, password: dueno.password });
}

export async function yo(usuarioId: string) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: usuarioPublico });
  if (!u) throw new HttpError(401, 'NO_AUTENTICADO', 'El usuario no existe');
  return u;
}
