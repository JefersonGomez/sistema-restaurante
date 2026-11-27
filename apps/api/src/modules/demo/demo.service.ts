import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { DemoInfo, RolPersonal } from '@menu-qr/shared';
import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../middlewares/errorHandler';
import { emitirTokens, usuarioPublico } from '../auth/auth.service';
import { borrarImagenes } from '../uploads/uploads.service';
import {
  crearRestauranteDemo,
  enLineaDemo,
  fotosDePlatos,
  historial,
  personalizacionDemo,
  tabletDemo,
} from './datos';

const HORAS_DEMO = 24;
const MAX_DEMOS = 100; // vivas a la vez, para cuidar el servidor
const PERSONAL: Record<RolPersonal, string> = {
  DUENO: 'Doña Marta',
  MESERO: 'Andrés',
  COCINA: 'Lucía',
  CAJA: 'Carlos',
  REPARTIDOR: 'Pepe',
};
const venceEn = (creada: Date) => new Date(creada.getTime() + HORAS_DEMO * 3_600_000);

// Restaurante de ejemplo propio de esta visita, con la sesión iniciada en el rol elegido.
export async function crear(rol: RolPersonal) {
  if ((await prisma.restaurante.count({ where: { esDemo: true } })) >= MAX_DEMOS)
    throw new HttpError(
      503,
      'DEMOS_LLENAS',
      'Hay muchas demos abiertas en este momento. Intente de nuevo en unos minutos.',
    );
  const sufijo = randomBytes(5).toString('hex');
  // Nadie conoce la contraseña: a la demo se entra solo con este botón.
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 4);
  const usuarios = Object.entries(PERSONAL).map(([r, nombre]) => ({
    rol: r as RolPersonal,
    nombre,
    email: `${r.toLowerCase()}.${sufijo}@demo.kitchago.invalid`,
    passwordHash,
  }));
  const r = await prisma.$transaction(
    (tx) =>
      crearRestauranteDemo(tx, {
        nombre: 'Soda La Esquina',
        slug: `demo-${sufijo}`,
        esDemo: true,
        usuarios,
      }),
    { timeout: 30_000 },
  );
  try {
    await fotosDePlatos(r.id, true);
    await personalizacionDemo(r.id, true);
    await enLineaDemo(r.id);
    await tabletDemo(r.id);
    await prisma.restaurante.update({
      where: { id: r.id },
      data: {
        plan: 'COMPLETO',
        planVenceEn: venceEn(new Date()),
        fidelidadActiva: true,
        sellosMeta: 5,
        premioFidelidad: 'Un fresco natural gratis',
      },
    });
    await historial(r);
  } catch (e) {
    await borrar(r.id).catch(() => {});
    throw e;
  }
  return entrarComo(r.id, rol);
}

async function entrarComo(restauranteId: string, rol: RolPersonal) {
  const u = await prisma.usuario.findFirstOrThrow({ where: { restauranteId, rol } });
  const tokens = await emitirTokens(u);
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: u.id },
    select: usuarioPublico,
  });
  return { ...tokens, usuario };
}

async function demoDe(restauranteId: string | null) {
  const r = restauranteId
    ? await prisma.restaurante.findUnique({ where: { id: restauranteId } })
    : null;
  if (!r?.esDemo) throw new HttpError(404, 'NO_ES_DEMO', 'Esta cuenta no es una demo');
  return r;
}

// Ver la misma demo con otro rol (solo dentro de una demo).
export async function cambiarRol(restauranteId: string | null, rol: RolPersonal) {
  const r = await demoDe(restauranteId);
  return entrarComo(r.id, rol);
}

export async function info(restauranteId: string | null): Promise<DemoInfo> {
  const r = await demoDe(restauranteId);
  // Primera mesa libre (en los datos de ejemplo, la 3): ahí se prueba pedir como cliente.
  const libre = await prisma.mesa.findFirst({
    where: { restauranteId: r.id, activa: true, cuentas: { none: { estado: { not: 'CERRADA' } } } },
    orderBy: { numero: 'asc' },
    select: { tokenQr: true },
  });
  return {
    expiraEn: venceEn(r.createdAt).toISOString(),
    enLineaUrl: `${env.MENU_PUBLIC_URL}/r/${r.slug}`,
    mesaUrl: libre ? `${env.MENU_PUBLIC_URL}/m/${libre.tokenQr}` : null,
  };
}

// Borra el restaurante y todo lo suyo, en orden (no todas las relaciones son en cascada).
export async function borrar(restauranteId: string) {
  const where = { restauranteId };
  const [r, platos] = await Promise.all([
    prisma.restaurante.findUnique({
      where: { id: restauranteId },
      select: { logoUrl: true, bannerUrl: true },
    }),
    prisma.plato.findMany({ where, select: { fotoUrl: true, fotoMiniUrl: true } }),
  ]);
  if (!r) return;
  await prisma.$transaction(
    [
      prisma.restaurante.update({
        where: { id: restauranteId },
        data: { platoDestacadoId: null },
      }),
      prisma.comprobante.deleteMany({ where }),
      prisma.llamada.deleteMany({ where }),
      prisma.canjeSello.deleteMany({ where }),
      prisma.vistaPlato.deleteMany({ where }),
      prisma.turnoCaja.deleteMany({ where }),
      prisma.pagoSuscripcion.deleteMany({ where }),
      prisma.pedido.deleteMany({ where }),
      prisma.cuenta.deleteMany({ where }),
      prisma.clienteRegistrado.deleteMany({ where }),
      prisma.modificador.deleteMany({ where }),
      prisma.grupoModificadores.deleteMany({ where }),
      prisma.plato.deleteMany({ where }),
      prisma.categoria.deleteMany({ where }),
      prisma.dispositivo.deleteMany({ where }),
      prisma.usuario.deleteMany({ where }),
      prisma.mesa.deleteMany({ where }),
      prisma.estacion.deleteMany({ where }),
      prisma.restaurante.delete({ where: { id: restauranteId } }),
    ],
    { timeout: 60_000 },
  );
  // Solo se borran las imágenes de restaurantes/<id>/ (las de ejemplo son compartidas).
  await borrarImagenes(restauranteId, [
    r.logoUrl,
    r.bannerUrl,
    ...platos.flatMap((p) => [p.fotoUrl, p.fotoMiniUrl]),
  ]);
}

// Cada hora: se borran las demos de más de 24 h.
export async function borrarVencidas(ahora = new Date()) {
  const viejas = await prisma.restaurante.findMany({
    where: { esDemo: true, createdAt: { lt: new Date(ahora.getTime() - HORAS_DEMO * 3_600_000) } },
    select: { id: true },
  });
  for (const { id } of viejas) await borrar(id);
  return viejas.length;
}
