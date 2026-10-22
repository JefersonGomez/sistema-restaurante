import bcrypt from 'bcryptjs';
import type { LoginInput } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import {
  firmarAccessToken,
  generarRefreshToken,
  hashToken,
  type UsuarioToken,
} from '../../lib/tokens';
import { HttpError } from '../../middlewares/errorHandler';

// Se compara contra este hash cuando el email no existe, para no revelar qué emails existen.
const HASH_RELLENO = bcrypt.hashSync('relleno', 10);

const usuarioPublico = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  restauranteId: true,
  debeCambiarPassword: true,
  restaurante: { select: { id: true, nombre: true, slug: true } },
} as const;

const conRestaurante = { restaurante: { select: { activo: true } } } as const;

// Usuario inactivo o de un restaurante desactivado no puede entrar.
const puedeEntrar = (u: { activo: boolean; restaurante: { activo: boolean } | null }) =>
  u.activo && (u.restaurante?.activo ?? true);

async function emitirTokens({ id, rol, restauranteId }: Omit<UsuarioToken, 'estacionId'>) {
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

export async function yo(usuarioId: string) {
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: usuarioPublico });
  if (!u) throw new HttpError(401, 'NO_AUTENTICADO', 'El usuario no existe');
  return u;
}
