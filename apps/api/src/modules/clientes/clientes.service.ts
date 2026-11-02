import bcrypt from 'bcryptjs';
import {
  normalizarTelefono,
  type ClienteFila,
  type ClientePerfil,
  type Fidelidad,
  type PerfilClienteInput,
  type RegistroClienteInput,
  type SesionClienteRegistrado,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { generarRefreshToken, hashToken } from '../../lib/tokens';
import { HttpError, noExiste } from '../../middlewares/errorHandler';

const DIAS_SESION = 30;
// Mismo trabajo de bcrypt aunque el correo no exista (no revela qué correos tienen cuenta).
const HASH_RELLENO = bcrypt.hashSync('relleno-para-comparar', 10);

// --- Fidelidad: sellos = pedidos en línea entregados − sellos ya canjeados ---

type ConfigFidelidad = {
  fidelidadActiva: boolean;
  sellosMeta: number;
  premioFidelidad: string | null;
};

export async function sellosDe(restauranteId: string, telefonos: string[]) {
  const unicos = [...new Set(telefonos.filter(Boolean))];
  if (!unicos.length) return new Map<string, number>();
  const [entregados, canjeados] = await Promise.all([
    prisma.cuenta.groupBy({
      by: ['telefonoNormal'],
      where: {
        restauranteId,
        tipo: { not: 'MESA' },
        etapa: 'ENTREGADO',
        telefonoNormal: { in: unicos },
      },
      _count: true,
    }),
    prisma.canjeSello.groupBy({
      by: ['telefonoNormal'],
      where: { restauranteId, telefonoNormal: { in: unicos } },
      _sum: { sellos: true },
    }),
  ]);
  const usados = new Map(canjeados.map((c) => [c.telefonoNormal, c._sum.sellos ?? 0]));
  return new Map(
    unicos.map((t) => [
      t,
      (entregados.find((e) => e.telefonoNormal === t)?._count ?? 0) - (usados.get(t) ?? 0),
    ]),
  );
}

const tarjeta = (r: ConfigFidelidad, sellos: number): Fidelidad | null =>
  r.fidelidadActiva
    ? { sellos, meta: r.sellosMeta, premio: r.premioFidelidad ?? 'Un premio' }
    : null;

export async function fidelidadDe(
  r: ConfigFidelidad & { id: string },
  telefonoNormal: string | null,
) {
  if (!r.fidelidadActiva || !telefonoNormal) return null;
  return tarjeta(r, (await sellosDe(r.id, [telefonoNormal])).get(telefonoNormal) ?? 0);
}

// Canjear el premio: descuenta los sellos de una tarjeta completa.
export async function canjear(restauranteId: string, usuarioId: string, telefono: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  if (!r.fidelidadActiva)
    throw new HttpError(409, 'FIDELIDAD_INACTIVA', 'La tarjeta de sellos está apagada');
  const tel = normalizarTelefono(telefono);
  return prisma.$transaction(async (tx) => {
    // Candado por teléfono: dos canjes a la vez no gastan los mismos sellos.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restauranteId + tel}))`;
    const sellos = (await sellosDe(restauranteId, [tel])).get(tel) ?? 0;
    if (sellos < r.sellosMeta)
      throw new HttpError(409, 'SELLOS_INSUFICIENTES', 'Todavía no completa la tarjeta');
    await tx.canjeSello.create({
      data: {
        restauranteId,
        telefonoNormal: tel,
        sellos: r.sellosMeta,
        premio: r.premioFidelidad ?? 'Un premio',
        usuarioId,
      },
    });
    return tarjeta(r, sellos - r.sellosMeta)!;
  });
}

// --- Lista de clientes (dueño) ---

export async function listar(restauranteId: string, buscar?: string): Promise<ClienteFila[]> {
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  const base = { restauranteId, tipo: { not: 'MESA' as const }, telefonoNormal: { not: null } };
  const filtro = buscar
    ? {
        OR: [
          { clienteNombre: { contains: buscar, mode: 'insensitive' as const } },
          ...(normalizarTelefono(buscar)
            ? [{ telefonoNormal: { contains: normalizarTelefono(buscar) } }]
            : []),
        ],
      }
    : {};
  const hace30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [entregados, recientes, ultimos] = await Promise.all([
    prisma.cuenta.groupBy({
      by: ['telefonoNormal'],
      where: { ...base, ...filtro, etapa: 'ENTREGADO' },
      _count: true,
      _sum: { total: true },
    }),
    prisma.cuenta.groupBy({
      by: ['telefonoNormal'],
      where: { ...base, ...filtro, etapa: 'ENTREGADO', cerradaEn: { gte: hace30 } },
      _count: true,
    }),
    // El último pedido de cada teléfono (de ahí sale el nombre que se muestra).
    prisma.cuenta.findMany({
      where: { ...base, ...filtro },
      orderBy: { abiertaEn: 'desc' },
      distinct: ['telefonoNormal'],
      select: { telefonoNormal: true, clienteNombre: true, abiertaEn: true },
      take: 500,
    }),
  ]);
  const telefonos = ultimos.map((u) => u.telefonoNormal!);
  const [sellos, registrados] = await Promise.all([
    r.fidelidadActiva ? sellosDe(restauranteId, telefonos) : new Map<string, number>(),
    prisma.clienteRegistrado.findMany({
      where: { restauranteId, telefonoNormal: { in: telefonos } },
      select: { telefonoNormal: true },
    }),
  ]);
  const conCuenta = new Set(registrados.map((c) => c.telefonoNormal));
  return ultimos
    .map((u) => {
      const tel = u.telefonoNormal!;
      const e = entregados.find((x) => x.telefonoNormal === tel);
      return {
        telefono: tel,
        nombre: u.clienteNombre ?? '',
        pedidos: e?._count ?? 0,
        gastado: e?._sum.total ?? 0,
        ultimoPedido: u.abiertaEn.toISOString(),
        frecuente: (recientes.find((x) => x.telefonoNormal === tel)?._count ?? 0) >= 3,
        registrado: conCuenta.has(tel),
        sellos: r.fidelidadActiva ? (sellos.get(tel) ?? 0) : null,
      };
    })
    .sort((a, b) => b.pedidos - a.pedidos || b.ultimoPedido.localeCompare(a.ultimoPedido));
}

// --- Cuenta del cliente (menú en línea) ---

async function restauranteActivo(slug: string) {
  const r = await prisma.restaurante.findUnique({ where: { slug } });
  if (!r || !r.activo) throw noExiste('Restaurante');
  return r;
}

async function abrirSesion(clienteId: string): Promise<string> {
  const token = generarRefreshToken();
  await prisma.sesionClienteRegistrado.create({
    data: {
      clienteId,
      tokenHash: hashToken(token),
      expiraEn: new Date(Date.now() + DIAS_SESION * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function perfil(clienteId: string): Promise<ClientePerfil> {
  const c = await prisma.clienteRegistrado.findUniqueOrThrow({
    where: { id: clienteId },
    include: { restaurante: true },
  });
  const pedidos = await prisma.cuenta.findMany({
    where: {
      restauranteId: c.restauranteId,
      tipo: { not: 'MESA' },
      OR: [{ clienteId: c.id }, { telefonoNormal: c.telefonoNormal }],
    },
    orderBy: { abiertaEn: 'desc' },
    take: 10,
    select: {
      numeroPedido: true,
      abiertaEn: true,
      total: true,
      etapa: true,
      tokenSeguimiento: true,
    },
  });
  return {
    id: c.id,
    nombre: c.nombre,
    email: c.email,
    telefono: c.telefono,
    direccion: c.direccion,
    referencia: c.referencia,
    ubicacion: c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null,
    fidelidad: await fidelidadDe(c.restaurante, c.telefonoNormal),
    pedidos: pedidos.map((p) => ({
      numero: p.numeroPedido ?? 0,
      fecha: p.abiertaEn.toISOString(),
      total: p.total,
      etapa: p.etapa ?? 'RECIBIDO',
      token: p.tokenSeguimiento ?? '',
    })),
  };
}

export async function registrar(
  slug: string,
  input: RegistroClienteInput,
): Promise<SesionClienteRegistrado> {
  const r = await restauranteActivo(slug);
  const existe = await prisma.clienteRegistrado.findUnique({
    where: { restauranteId_email: { restauranteId: r.id, email: input.email } },
  });
  if (existe)
    throw new HttpError(409, 'CORREO_EN_USO', 'Ya hay una cuenta con ese correo. Entre con ella.');
  const c = await prisma.clienteRegistrado.create({
    data: {
      restauranteId: r.id,
      nombre: input.nombre,
      email: input.email,
      telefono: input.telefono,
      telefonoNormal: normalizarTelefono(input.telefono),
      passwordHash: await bcrypt.hash(input.password, 10),
    },
  });
  return { token: await abrirSesion(c.id), cliente: await perfil(c.id) };
}

export async function entrar(
  slug: string,
  email: string,
  password: string,
): Promise<SesionClienteRegistrado> {
  const r = await restauranteActivo(slug);
  const c = await prisma.clienteRegistrado.findUnique({
    where: { restauranteId_email: { restauranteId: r.id, email } },
  });
  const ok = await bcrypt.compare(password, c?.passwordHash ?? HASH_RELLENO);
  if (!c || !ok) throw new HttpError(401, 'CREDENCIALES', 'Correo o contraseña incorrectos');
  return { token: await abrirSesion(c.id), cliente: await perfil(c.id) };
}

// Sesión del encabezado X-Cliente: solo vale en su restaurante. null si no hay o no sirve.
export async function sesionDe(slug: string, token: string | undefined) {
  if (!token) return null;
  const s = await prisma.sesionClienteRegistrado.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { cliente: { select: { restaurante: { select: { slug: true } } } } },
  });
  if (!s || s.revocada || s.expiraEn < new Date() || s.cliente.restaurante.slug !== slug)
    return null;
  return { sesionId: s.id, clienteId: s.clienteId };
}

export async function actualizarPerfil(clienteId: string, input: PerfilClienteInput) {
  await prisma.clienteRegistrado.update({
    where: { id: clienteId },
    data: {
      nombre: input.nombre,
      telefono: input.telefono,
      telefonoNormal: normalizarTelefono(input.telefono),
      direccion: input.direccion,
      referencia: input.referencia,
      lat: input.ubicacion?.lat ?? null,
      lng: input.ubicacion?.lng ?? null,
    },
  });
  return perfil(clienteId);
}

// Cambia la contraseña y cierra las demás sesiones (la actual sigue abierta).
export async function cambiarPassword(
  clienteId: string,
  sesionId: string,
  actual: string,
  nueva: string,
) {
  const c = await prisma.clienteRegistrado.findUniqueOrThrow({ where: { id: clienteId } });
  if (!(await bcrypt.compare(actual, c.passwordHash)))
    throw new HttpError(400, 'PASSWORD_ACTUAL', 'La contraseña actual no es correcta');
  await prisma.$transaction([
    prisma.clienteRegistrado.update({
      where: { id: clienteId },
      data: { passwordHash: await bcrypt.hash(nueva, 10) },
    }),
    prisma.sesionClienteRegistrado.updateMany({
      where: { clienteId, id: { not: sesionId } },
      data: { revocada: true },
    }),
  ]);
}

export async function salir(sesionId: string) {
  await prisma.sesionClienteRegistrado.update({
    where: { id: sesionId },
    data: { revocada: true },
  });
}
