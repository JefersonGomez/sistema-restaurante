import bcrypt from 'bcryptjs';
import { enviarCorreo } from '../../lib/correo';
import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import { generarRefreshToken, hashToken } from '../../lib/tokens';
import { HttpError } from '../../middlewares/errorHandler';

// "Olvidé mi contraseña": enlace de un solo uso que vence en 1 hora. Siempre se responde igual,
// exista o no el correo, para no revelar quién tiene cuenta.
const VIGENCIA_MS = 60 * 60 * 1000;

const enlaceInvalido = () =>
  new HttpError(400, 'ENLACE_INVALIDO', 'El enlace ya se usó o venció. Pida uno nuevo.');

async function crearEnlace(dueno: { usuarioId: string } | { clienteId: string }) {
  const token = generarRefreshToken();
  await prisma.recuperacionPassword.create({
    data: { ...dueno, tokenHash: hashToken(token), expiraEn: new Date(Date.now() + VIGENCIA_MS) },
  });
  return token;
}

// Marca el enlace como usado (una sola vez, aunque lleguen dos envíos a la vez).
async function consumir(token: string) {
  const r = await prisma.recuperacionPassword.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!r || r.usadoEn || r.expiraEn < new Date()) throw enlaceInvalido();
  const { count } = await prisma.recuperacionPassword.updateMany({
    where: { id: r.id, usadoEn: null },
    data: { usadoEn: new Date() },
  });
  if (!count) throw enlaceInvalido();
  return r;
}

const texto = (nombre: string, enlace: string) =>
  `Hola, ${nombre}:\n\nPara crear una contraseña nueva abra este enlace (vence en 1 hora):\n${enlace}\n\n` +
  'Si usted no lo pidió, ignore este correo: su contraseña sigue igual.';

// --- Personal (login del panel) ---

export async function olvidePersonal(email: string) {
  const u = await prisma.usuario.findUnique({
    where: { email },
    include: { restaurante: { select: { activo: true, esDemo: true } } },
  });
  // En una demo no se mandan correos (Fase 21).
  if (!u || !u.activo || u.restaurante?.activo === false || u.restaurante?.esDemo) return;
  const token = await crearEnlace({ usuarioId: u.id });
  await enviarCorreo({
    para: u.email,
    asunto: 'Cambiar su contraseña',
    texto: texto(u.nombre, `${env.STAFF_PUBLIC_URL}/restablecer?token=${token}`),
  });
}

export async function restablecerPersonal(token: string, password: string) {
  const r = await consumir(token);
  if (!r.usuarioId) throw enlaceInvalido();
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: r.usuarioId },
      data: { passwordHash: await bcrypt.hash(password, 10), debeCambiarPassword: false },
    }),
    prisma.refreshToken.updateMany({ where: { usuarioId: r.usuarioId }, data: { revocado: true } }),
  ]);
}

// --- Clientes del menú en línea (la cuenta es de un restaurante) ---

export async function olvideCliente(slug: string, email: string) {
  const c = await prisma.clienteRegistrado.findFirst({
    where: { email, restaurante: { slug, activo: true, esDemo: false } },
    include: { restaurante: { select: { nombre: true } } },
  });
  if (!c) return;
  const token = await crearEnlace({ clienteId: c.id });
  await enviarCorreo({
    para: c.email,
    asunto: `${c.restaurante.nombre}: cambiar su contraseña`,
    texto: texto(c.nombre, `${env.MENU_PUBLIC_URL}/r/${slug}/restablecer?token=${token}`),
  });
}

export async function restablecerCliente(slug: string, token: string, password: string) {
  const r = await consumir(token);
  const c = r.clienteId
    ? await prisma.clienteRegistrado.findFirst({
        where: { id: r.clienteId, restaurante: { slug } },
      })
    : null;
  if (!c) throw enlaceInvalido();
  await prisma.$transaction([
    prisma.clienteRegistrado.update({
      where: { id: c.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    }),
    prisma.sesionClienteRegistrado.updateMany({
      where: { clienteId: c.id },
      data: { revocada: true },
    }),
  ]);
}
