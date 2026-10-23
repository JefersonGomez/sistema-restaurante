// Datos de demostración que el seed agrega si faltan (también sobre un restaurante demo ya creado):
// fotos generadas para los platos, 30 días de cuentas cerradas para los reportes y una tablet de
// cocina vinculada. Solo para desarrollo.
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { calcularTotales } from '@menu-qr/shared';
import type { Prisma } from '../src/generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { storage } from '../src/lib/storage';
import { hashToken } from '../src/lib/tokens';

type Restaurante = {
  id: string;
  porcentajeIva: number;
  porcentajeServicio: number;
  preciosIncluyenImpuestos: boolean;
};

// Generador pseudoaleatorio con semilla: el historial sale igual en cada máquina.
function azar(semilla: number) {
  let a = semilla;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    entre: (min: number, max: number) => min + Math.floor(f() * (max - min + 1)),
    uno: <T>(xs: readonly T[]) => xs[Math.floor(f() * xs.length)]!,
    prob: (p: number) => f() < p,
  };
}

const COLOR_CATEGORIA: Record<string, [string, string]> = {
  Desayunos: ['#f7a91c', '#e2741b'],
  'Platos fuertes': ['#5b2db5', '#8e6aec'],
  Bocas: ['#d94a38', '#f08a5d'],
  Bebidas: ['#1f9d6b', '#58c79c'],
};
const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Foto simple: degradado del color de la categoría, un plato y el nombre. 960 y 320 px en WEBP.
export async function fotosDePlatos(restauranteId: string) {
  const platos = await prisma.plato.findMany({
    where: { restauranteId, fotoUrl: null },
    include: { categoria: { select: { nombreEs: true } } },
  });
  for (const p of platos) {
    const [c1, c2] = COLOR_CATEGORIA[p.categoria.nombreEs] ?? ['#5b2db5', '#f7a91c'];
    const palabras = p.nombreEs.split(' ');
    const lineas =
      palabras.length > 2
        ? [palabras.slice(0, 2).join(' '), palabras.slice(2).join(' ')]
        : [p.nombreEs];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="960">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="960" height="960" fill="url(#g)"/>
      <circle cx="480" cy="400" r="250" fill="#ffffff" opacity="0.92"/>
      <circle cx="480" cy="400" r="190" fill="none" stroke="${c1}" stroke-width="14" opacity="0.35"/>
      ${lineas
        .map(
          (l, i) =>
            `<text x="480" y="${760 + i * 84}" font-family="Poppins, Arial, sans-serif" font-size="72" font-weight="700" fill="#ffffff" text-anchor="middle">${escapar(l)}</text>`,
        )
        .join('')}
    </svg>`;
    const base = sharp(Buffer.from(svg));
    const [grande, chica] = await Promise.all([
      base.clone().webp({ quality: 80 }).toBuffer(),
      base.clone().resize(320, 320).webp({ quality: 80 }).toBuffer(),
    ]);
    const carpeta = `restaurantes/${restauranteId}/platos/${randomUUID()}`;
    const [fotoUrl, fotoMiniUrl] = await Promise.all([
      storage.guardar(`${carpeta}-960.webp`, grande, 'image/webp'),
      storage.guardar(`${carpeta}-320.webp`, chica, 'image/webp'),
    ]);
    await prisma.plato.update({ where: { id: p.id }, data: { fotoUrl, fotoMiniUrl } });
  }
  return platos.length;
}

// Tablet de la cocina ya vinculada (su token no se usa: para probar, vincule otra con un código).
export async function tabletDemo(restauranteId: string) {
  if (await prisma.dispositivo.count({ where: { restauranteId } })) return false;
  const cocina = await prisma.estacion.findFirstOrThrow({
    where: { restauranteId, nombre: 'Cocina' },
  });
  await prisma.dispositivo.create({
    data: {
      restauranteId,
      estacionId: cocina.id,
      nombre: 'Tablet de la cocina',
      tokenHash: hashToken(randomBytes(32).toString('base64url')),
      vinculadoEn: new Date(Date.now() - 20 * 86_400_000),
      ultimoUso: new Date(Date.now() - 86_400_000),
    },
  });
  return true;
}

const CLIENTES = ['Ana', 'Luis', 'María', 'Carlos', 'Sofía', 'Diego', 'Valeria', 'José'];
const DIRECCIONES = [
  'Barrio Escalante, 100 m norte del parque',
  'San Pedro, frente a la UCR',
  'Barrio Amón, casa esquinera',
  'Los Yoses, edificio azul, apto 3',
];
const MOTIVOS = ['Se acabó', 'El cliente cambió de idea', 'Pedido duplicado', 'Tardaba mucho'];
const OFFSET_CR_H = 6; // Costa Rica = UTC−6 todo el año

// 30 días de cuentas cerradas al azar (días anteriores a hoy), con horas pico al almuerzo y
// en la tarde, ítems con tiempos de preparación, algunas cancelaciones y vistas de platos.
export async function historial(r: Restaurante, dias = 30) {
  const restauranteId = r.id;
  const hace2dias = new Date(Date.now() - 2 * 86_400_000);
  if (await prisma.cuenta.count({ where: { restauranteId, cerradaEn: { lt: hace2dias } } }))
    return 0;

  const platos = await prisma.plato.findMany({
    where: { restauranteId, activo: true },
    include: { grupos: { include: { modificadores: true } } },
  });
  const mesas = await prisma.mesa.findMany({ where: { restauranteId } });
  const mesero = await prisma.usuario.findFirstOrThrow({ where: { restauranteId, rol: 'MESERO' } });
  const caja = await prisma.usuario.findFirstOrThrow({ where: { restauranteId, rol: 'CAJA' } });
  const a = azar(20261022);
  const metodos = [
    'EFECTIVO',
    'EFECTIVO',
    'TARJETA',
    'TARJETA',
    'TARJETA',
    'SINPE',
    'SINPE',
  ] as const;
  // Más peso al almuerzo (11–14) y a la tarde (17–19).
  const horas = [7, 8, 9, 10, 11, 11, 12, 12, 12, 13, 13, 14, 15, 16, 17, 18, 18, 19, 19, 20];

  const cuentas: Prisma.CuentaCreateManyInput[] = [];
  const pedidos: Prisma.PedidoCreateManyInput[] = [];
  const items: Prisma.PedidoItemCreateManyInput[] = [];
  const mods: Prisma.PedidoItemModificadorCreateManyInput[] = [];
  const vistas = new Map<string, number>(); // `${platoId}|${dia}` → vistas

  let numeroPedido = 0; // correlativo de los pedidos en línea
  const hoy = new Date(Date.now() - OFFSET_CR_H * 3_600_000); // "ahora" en hora local
  for (let d = dias; d >= 1; d--) {
    const fecha = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - d));
    const domingo = fecha.getUTCDay() === 0;
    const dia = fecha.toISOString().slice(0, 10);
    const n = domingo ? a.entre(8, 14) : a.entre(14, 28);
    for (let k = 0; k < n; k++) {
      const h = domingo ? a.entre(8, 14) : a.uno(horas);
      // Hora local → UTC (+6 h).
      const cerradaEn = new Date(
        fecha.getTime() + (h + OFFSET_CR_H) * 3_600_000 + a.entre(0, 59) * 60_000,
      );
      const abiertaEn = new Date(cerradaEn.getTime() - a.entre(35, 80) * 60_000);
      const cuentaId = randomUUID();
      const lineas: { precioUnitario: number; cantidad: number; cancelado: boolean }[] = [];
      const nPedidos = a.prob(0.3) ? 2 : 1;
      for (let j = 0; j < nPedidos; j++) {
        const pedidoId = randomUUID();
        const confirmadoEn = new Date(abiertaEn.getTime() + (j * 20 + a.entre(2, 6)) * 60_000);
        pedidos.push({
          id: pedidoId,
          restauranteId,
          cuentaId,
          estado: 'CONFIRMADO',
          origen: a.prob(0.7) ? 'CLIENTE' : 'MESERO',
          clientRequestId: `hist-${pedidoId}`,
          confirmadoEn,
          confirmadoPorId: mesero.id,
          createdAt: confirmadoEn,
        });
        for (let x = a.entre(1, 4); x > 0; x--) {
          const plato = a.uno(platos);
          const elegidos = plato.grupos
            .filter((g) => g.obligatorio)
            .map((g) => a.uno(g.modificadores));
          const precioUnitario = plato.precio + elegidos.reduce((s, m) => s + m.precioExtra, 0);
          const cantidad = a.prob(0.25) ? 2 : 1;
          const cancelado = a.prob(0.03);
          const enPreparacionEn = new Date(confirmadoEn.getTime() + a.entre(1, 4) * 60_000);
          // La mayoría sale en 4–13 min; algunos se demoran.
          const prep = a.prob(0.1) ? a.entre(18, 28) : a.entre(4, 13);
          const listoEn = new Date(enPreparacionEn.getTime() + prep * 60_000);
          const itemId = randomUUID();
          items.push({
            id: itemId,
            pedidoId,
            platoId: plato.id,
            estacionId: plato.estacionId,
            cantidad,
            precioUnitario,
            estado: cancelado ? 'PENDIENTE' : 'ENTREGADO',
            cancelado,
            motivoCancelacion: cancelado ? a.uno(MOTIVOS) : null,
            enPreparacionEn: cancelado ? null : enPreparacionEn,
            listoEn: cancelado ? null : listoEn,
            entregadoEn: cancelado ? null : new Date(listoEn.getTime() + a.entre(1, 4) * 60_000),
            createdAt: confirmadoEn,
            updatedAt: cancelado ? enPreparacionEn : listoEn,
          });
          for (const m of elegidos)
            mods.push({
              pedidoItemId: itemId,
              modificadorId: m.id,
              nombre: m.nombreEs,
              precioExtra: m.precioExtra,
            });
          lineas.push({ precioUnitario, cantidad, cancelado });
          // Cada plato pedido se miró antes en el menú, y varios se miraron sin pedirse.
          const clave = `${plato.id}|${dia}`;
          vistas.set(clave, (vistas.get(clave) ?? 0) + a.entre(1, 3));
        }
      }
      for (let v = a.entre(0, 3); v > 0; v--) {
        const clave = `${a.uno(platos).id}|${dia}`;
        vistas.set(clave, (vistas.get(clave) ?? 0) + 1);
      }
      // ~15 % son pedidos en línea (sin mesa, sin servicio; a domicilio con envío).
      const enLinea = a.prob(0.15) ? a.uno(['RECOGER', 'DOMICILIO'] as const) : null;
      const envio = enLinea === 'DOMICILIO' ? 100000 : 0;
      const t = calcularTotales(lineas, enLinea ? { ...r, porcentajeServicio: 0 } : r);
      const pago = enLinea ? a.uno(['EFECTIVO', 'SINPE'] as const) : a.uno(metodos);
      cuentas.push({
        id: cuentaId,
        restauranteId,
        estado: 'CERRADA',
        verificada: true,
        ...t,
        total: t.total + envio,
        metodoPago: pago,
        cerradaPorId: caja.id,
        abiertaEn,
        cerradaEn,
        createdAt: abiertaEn,
        ...(enLinea
          ? {
              tipo: enLinea,
              numeroPedido: ++numeroPedido,
              clienteNombre: a.uno(CLIENTES),
              clienteTelefono: `8${a.entre(100, 999)} ${a.entre(1000, 9999)}`,
              direccionEntrega: enLinea === 'DOMICILIO' ? a.uno(DIRECCIONES) : null,
              costoEnvio: envio,
              pagoElegido: pago,
              pagoVerificado: pago === 'SINPE',
              etapa: 'ENTREGADO' as const,
              tiempoEstimadoMin: a.uno([20, 25, 30]),
              tokenSeguimiento: randomBytes(24).toString('base64url'),
            }
          : { mesaId: a.uno(mesas).id, numeroComensales: a.entre(1, 5) }),
      });
    }
  }

  await prisma.$transaction(
    [
      prisma.cuenta.createMany({ data: cuentas }),
      prisma.pedido.createMany({ data: pedidos }),
      prisma.pedidoItem.createMany({ data: items }),
      prisma.pedidoItemModificador.createMany({ data: mods }),
      prisma.vistaPlato.createMany({
        data: [...vistas].map(([clave, n]) => {
          const [platoId, dia] = clave.split('|') as [string, string];
          return { restauranteId, platoId, dia: new Date(`${dia}T00:00:00Z`), vistas: n };
        }),
      }),
    ],
    { timeout: 60_000 },
  );
  return cuentas.length;
}

// Personalización de ejemplo (Fase 4): eslogan, contacto, dirección y un banner generado.
export async function personalizacionDemo(restauranteId: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  if (r.bannerUrl || r.eslogan) return false;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7a91c"/><stop offset="0.55" stop-color="#e2741b"/>
      <stop offset="1" stop-color="#5b2db5"/></linearGradient></defs>
    <rect width="1600" height="600" fill="url(#g)"/>
    <circle cx="1260" cy="300" r="230" fill="#ffffff" opacity="0.9"/>
    <circle cx="1260" cy="300" r="170" fill="none" stroke="#e2741b" stroke-width="16" opacity="0.35"/>
    <circle cx="300" cy="520" r="140" fill="#ffffff" opacity="0.12"/>
  </svg>`;
  const banner = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  const bannerUrl = await storage.guardar(
    `restaurantes/${restauranteId}/banner/${randomUUID()}.webp`,
    banner,
    'image/webp',
  );
  await prisma.restaurante.update({
    where: { id: restauranteId },
    data: {
      bannerUrl,
      eslogan: r.eslogan ?? 'Comida tica casera, como en la casa de la abuela',
      telefono: r.telefono ?? '2222 3333',
      direccion: r.direccion ?? 'Barrio Escalante, San José, Costa Rica',
    },
  });
  return true;
}

// Pedidos en línea activados en el restaurante demo (si nunca se configuraron).
export async function enLineaDemo(restauranteId: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  if (r.enLineaActivo || r.sinpeNumero) return false;
  await prisma.restaurante.update({
    where: { id: restauranteId },
    data: {
      enLineaActivo: true,
      enLineaRecoger: true,
      enLineaDomicilio: true,
      costoEnvio: 100000,
      zonaEntrega: 'San José centro, Barrio Escalante, Los Yoses y San Pedro',
      sinpeNumero: '8888 0000',
      sinpeNombre: 'Soda La Esquina',
      tiempoEstimadoMin: 25,
    },
  });
  return true;
}
