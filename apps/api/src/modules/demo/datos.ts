// Datos de ejemplo de la soda: los usa el seed (desarrollo) y la demo de una visita (Fase 21).
// Menú con fotos generadas, mesas con pedidos en distintos estados, 30 días de cuentas cerradas
// para los reportes, pedidos en línea y una tablet de cocina vinculada.
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { calcularTotales } from '@menu-qr/shared';
import type { Prisma, Rol } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { generarTokenQr, hashToken } from '../../lib/tokens';

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

// Las demos comparten las fotos de ejemplo (carpeta demo/, se generan una vez por proceso y
// nunca se borran: el borrado de una demo solo toca restaurantes/<id>/).
const fotosCompartidas = new Map<string, Promise<{ fotoUrl: string; fotoMiniUrl: string }>>();

// Foto simple: degradado del color de la categoría, un plato y el nombre. 960 y 320 px en WEBP.
export async function fotosDePlatos(restauranteId: string, compartidas = false) {
  const platos = await prisma.plato.findMany({
    where: { restauranteId, fotoUrl: null },
    include: { categoria: { select: { nombreEs: true } } },
  });
  for (const p of platos) {
    if (compartidas) {
      const clave = `${p.categoria.nombreEs}|${p.nombreEs}`;
      if (!fotosCompartidas.has(clave))
        fotosCompartidas.set(
          clave,
          generarFoto(p.categoria.nombreEs, p.nombreEs, `demo/platos/${randomUUID()}`),
        );
      const fotos = await fotosCompartidas.get(clave)!.catch((e) => {
        fotosCompartidas.delete(clave); // se reintenta en la próxima demo
        throw e;
      });
      await prisma.plato.update({ where: { id: p.id }, data: fotos });
      continue;
    }
    const fotos = await generarFoto(
      p.categoria.nombreEs,
      p.nombreEs,
      `restaurantes/${restauranteId}/platos/${randomUUID()}`,
    );
    await prisma.plato.update({ where: { id: p.id }, data: fotos });
  }
  return platos.length;
}

async function generarFoto(categoria: string, nombre: string, carpeta: string) {
  const [c1, c2] = COLOR_CATEGORIA[categoria] ?? ['#5b2db5', '#f7a91c'];
  const palabras = nombre.split(' ');
  const lineas =
    palabras.length > 2 ? [palabras.slice(0, 2).join(' '), palabras.slice(2).join(' ')] : [nombre];
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
  const [fotoUrl, fotoMiniUrl] = await Promise.all([
    storage.guardar(`${carpeta}-960.webp`, grande, 'image/webp'),
    storage.guardar(`${carpeta}-320.webp`, chica, 'image/webp'),
  ]);
  return { fotoUrl, fotoMiniUrl };
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
let bannerCompartido: Promise<string> | null = null;
export async function personalizacionDemo(restauranteId: string, compartida = false) {
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  if (r.bannerUrl || r.eslogan) return false;
  const bannerUrl = await (compartida
    ? (bannerCompartido ??= generarBanner(`demo/banner/${randomUUID()}.webp`).catch((e) => {
        bannerCompartido = null;
        throw e;
      }))
    : generarBanner(`restaurantes/${restauranteId}/banner/${randomUUID()}.webp`));
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

async function generarBanner(clave: string) {
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
  return storage.guardar(clave, banner, 'image/webp');
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

const colones = (monto: number) => monto * 100; // a céntimos

export type UsuarioDemo = {
  rol: Rol;
  nombre: string;
  email: string;
  passwordHash: string;
  pinHash?: string | null;
};

// Restaurante con menú (13 platos, 4 categorías), horario, promoción, 8 mesas y pedidos de ejemplo.
export async function crearRestauranteDemo(
  tx: Prisma.TransactionClient,
  datos: { nombre: string; slug: string; esDemo?: boolean; usuarios: UsuarioDemo[] },
) {
  const restaurante = await tx.restaurante.create({
    data: {
      nombre: datos.nombre,
      slug: datos.slug,
      esDemo: datos.esDemo ?? false,
      moneda: 'CRC',
      preciosIncluyenImpuestos: true,
    },
  });
  const restauranteId = restaurante.id;

  await tx.usuario.createMany({
    data: datos.usuarios.map((u) => ({ ...u, restauranteId })),
  });

  const cocina = await tx.estacion.create({ data: { restauranteId, nombre: 'Cocina' } });
  const bar = await tx.estacion.create({ data: { restauranteId, nombre: 'Bar' } });

  const categoria = (orden: number, nombreEs: string, nombreEn: string, icono: string) =>
    tx.categoria.create({ data: { restauranteId, orden, nombreEs, nombreEn, icono } });
  const desayunos = await categoria(1, 'Desayunos', 'Breakfast', '☕');
  const fuertes = await categoria(2, 'Platos fuertes', 'Main dishes', '🍛');
  const bocas = await categoria(3, 'Bocas', 'Appetizers', '🍢');
  const bebidas = await categoria(4, 'Bebidas', 'Drinks', '🥤');

  type GrupoDemo = {
    nombreEs: string;
    nombreEn: string;
    obligatorio: boolean;
    minimo: number;
    maximo: number;
    opciones: [string, string, number][]; // [es, en, precioExtra en colones]
  };
  type PlatoDemo = {
    categoriaId: string;
    estacionId: string;
    nombreEs: string;
    nombreEn: string;
    descripcionEs: string;
    descripcionEn: string;
    precio: number; // colones
    alergenos?: string[];
    grupos?: GrupoDemo[];
  };

  const platos: PlatoDemo[] = [
    {
      categoriaId: desayunos.id,
      estacionId: cocina.id,
      nombreEs: 'Gallo pinto con huevo',
      nombreEn: 'Gallo pinto with eggs',
      descripcionEs: 'Arroz y frijoles, huevos al gusto, natilla, plátano maduro y tortilla.',
      descripcionEn: 'Rice and beans, eggs your way, sour cream, sweet plantain and tortilla.',
      precio: 3800,
      alergenos: ['huevo', 'lacteos'],
      grupos: [
        {
          nombreEs: 'Huevos',
          nombreEn: 'Eggs',
          obligatorio: true,
          minimo: 1,
          maximo: 1,
          opciones: [
            ['Fritos', 'Fried', 0],
            ['Revueltos', 'Scrambled', 0],
            ['Picados', 'Diced', 0],
          ],
        },
      ],
    },
    {
      categoriaId: desayunos.id,
      estacionId: cocina.id,
      nombreEs: 'Empanadas de queso',
      nombreEn: 'Cheese empanadas',
      descripcionEs: 'Dos empanadas de maíz rellenas de queso, con chilero.',
      descripcionEn: 'Two corn empanadas filled with cheese, served with pickled hot sauce.',
      precio: 2200,
      alergenos: ['lacteos'],
    },
    {
      categoriaId: fuertes.id,
      estacionId: cocina.id,
      nombreEs: 'Casado con pollo',
      nombreEn: 'Casado with chicken',
      descripcionEs: 'Arroz, frijoles, ensalada, plátano maduro y pollo en salsa.',
      descripcionEn: 'Rice, beans, salad, sweet plantain and chicken in sauce.',
      precio: 4800,
    },
    {
      categoriaId: fuertes.id,
      estacionId: cocina.id,
      nombreEs: 'Casado con bistec',
      nombreEn: 'Casado with steak',
      descripcionEs: 'Arroz, frijoles, ensalada, plátano maduro y bistec encebollado.',
      descripcionEn: 'Rice, beans, salad, sweet plantain and steak with onions.',
      precio: 5500,
      grupos: [
        {
          nombreEs: 'Término de la carne',
          nombreEn: 'Steak doneness',
          obligatorio: true,
          minimo: 1,
          maximo: 1,
          opciones: [
            ['Término medio', 'Medium', 0],
            ['Tres cuartos', 'Medium well', 0],
            ['Bien cocido', 'Well done', 0],
          ],
        },
        {
          nombreEs: 'Extras',
          nombreEn: 'Extras',
          obligatorio: false,
          minimo: 0,
          maximo: 2,
          opciones: [
            ['Huevo frito', 'Fried egg', 500],
            ['Aguacate', 'Avocado', 800],
          ],
        },
      ],
    },
    {
      categoriaId: fuertes.id,
      estacionId: cocina.id,
      nombreEs: 'Arroz con pollo',
      nombreEn: 'Chicken and rice',
      descripcionEs: 'Arroz con pollo, papas tostadas y ensalada.',
      descripcionEn: 'Chicken and rice with potato chips and salad.',
      precio: 4200,
    },
    {
      categoriaId: fuertes.id,
      estacionId: cocina.id,
      nombreEs: 'Olla de carne',
      nombreEn: 'Beef and vegetable stew',
      descripcionEs: 'Sopa de res con yuca, chayote, elote, ñampí y arroz aparte.',
      descripcionEn: 'Beef soup with cassava, chayote, corn, taro and rice on the side.',
      precio: 5200,
    },
    {
      categoriaId: bocas.id,
      estacionId: cocina.id,
      nombreEs: 'Chifrijo',
      nombreEn: 'Chifrijo',
      descripcionEs: 'Arroz, frijoles, chicharrón, pico de gallo y tortillas tostadas.',
      descripcionEn: 'Rice, beans, fried pork, pico de gallo and tortilla chips.',
      precio: 3900,
    },
    {
      categoriaId: bocas.id,
      estacionId: cocina.id,
      nombreEs: 'Patacones con frijolitos',
      nombreEn: 'Patacones with bean dip',
      descripcionEs: 'Plátano verde frito con frijoles molidos y pico de gallo.',
      descripcionEn: 'Fried green plantain with refried beans and pico de gallo.',
      precio: 3200,
    },
    {
      categoriaId: bocas.id,
      estacionId: cocina.id,
      nombreEs: 'Ceviche de pescado',
      nombreEn: 'Fish ceviche',
      descripcionEs: 'Pescado curtido en limón con cebolla, culantro y galletas.',
      descripcionEn: 'Lime-cured fish with onion, cilantro and crackers.',
      precio: 4500,
      alergenos: ['pescado', 'gluten'],
    },
    {
      categoriaId: bebidas.id,
      estacionId: bar.id,
      nombreEs: 'Refresco natural',
      nombreEn: 'Fresh fruit drink',
      descripcionEs: 'En agua o en leche.',
      descripcionEn: 'With water or milk.',
      precio: 1500,
      grupos: [
        {
          nombreEs: 'Sabor',
          nombreEn: 'Flavor',
          obligatorio: true,
          minimo: 1,
          maximo: 1,
          opciones: [
            ['Cas', 'Cas (sour guava)', 0],
            ['Mora', 'Blackberry', 0],
            ['Tamarindo', 'Tamarind', 0],
            ['Fresa en leche', 'Strawberry milkshake', 300],
          ],
        },
      ],
    },
    {
      categoriaId: bebidas.id,
      estacionId: bar.id,
      nombreEs: 'Café chorreado',
      nombreEn: 'Drip coffee',
      descripcionEs: 'Café costarricense colado en chorreador.',
      descripcionEn: 'Costa Rican coffee brewed in a cloth drip filter.',
      precio: 1200,
    },
    {
      categoriaId: bebidas.id,
      estacionId: bar.id,
      nombreEs: 'Agua dulce',
      nombreEn: 'Sugarcane drink',
      descripcionEs: 'Tapa de dulce disuelta en agua, caliente o fría.',
      descripcionEn: 'Raw sugarcane dissolved in water, hot or cold.',
      precio: 1000,
    },
  ];

  for (const [i, { grupos = [], precio, ...p }] of platos.entries()) {
    const plato = await tx.plato.create({
      data: { ...p, restauranteId, orden: i, precio: colones(precio) },
    });
    for (const g of grupos) {
      const { opciones, ...datosGrupo } = g;
      await tx.grupoModificadores.create({
        data: {
          ...datosGrupo,
          restauranteId,
          platoId: plato.id,
          modificadores: {
            create: opciones.map(([nombreEs, nombreEn, extra]) => ({
              restauranteId,
              nombreEs,
              nombreEn,
              precioExtra: colones(extra),
            })),
          },
        },
      });
    }
  }

  // Horario: lunes a sábado 7:00–21:00, domingo 8:00–15:00 (hora de Costa Rica).
  await tx.horarioRestaurante.createMany({
    data: [
      ...[1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        restauranteId,
        diaSemana,
        abre: '07:00',
        cierra: '21:00',
      })),
      { restauranteId, diaSemana: 0, abre: '08:00', cierra: '15:00' },
    ],
  });

  // Promoción activa del banner: chifrijo a ₡3 500 (normal ₡3 900).
  const chifrijo = await tx.plato.findFirstOrThrow({
    where: { restauranteId, nombreEs: 'Chifrijo' },
  });
  await tx.restaurante.update({
    where: { id: restauranteId },
    data: {
      platoDestacadoId: chifrijo.id,
      textoPromoEs: 'Jueves de',
      textoPromoEn: 'Thursday special',
      precioPromo: colones(3500),
    },
  });

  await tx.mesa.createMany({
    data: Array.from({ length: 8 }, (_, i) => ({
      restauranteId,
      numero: i + 1,
      tokenQr: generarTokenQr(),
    })),
  });

  await crearOperacionDemo(tx, restaurante);
  return restaurante;
}

// Cuentas y pedidos de ejemplo en distintos estados. La mesa 3 queda libre para probar.
//   Mesa 1: pedido confirmado con ítems en preparación, listo y entregado
//   Mesa 2: pedido esperando confirmación del mesero
//   Mesa 4: pidió la cuenta
//   Mesa 5: está llamando al mesero
//   Mesa 6: cuenta cerrada hoy (aparece en el reporte "Hoy")
async function crearOperacionDemo(
  tx: Prisma.TransactionClient,
  r: {
    id: string;
    porcentajeIva: number;
    porcentajeServicio: number;
    preciosIncluyenImpuestos: boolean;
  },
) {
  const restauranteId = r.id;
  const platos = await tx.plato.findMany({
    where: { restauranteId },
    include: {
      grupos: {
        orderBy: { createdAt: 'asc' },
        include: { modificadores: { orderBy: { createdAt: 'asc' } } },
      },
    },
  });
  const mesas = await tx.mesa.findMany({ where: { restauranteId } });
  const mesero = await tx.usuario.findFirstOrThrow({ where: { restauranteId, rol: 'MESERO' } });
  const caja = await tx.usuario.findFirstOrThrow({ where: { restauranteId, rol: 'CAJA' } });
  const hace = (min: number) => new Date(Date.now() - min * 60_000);

  // Ítem con la primera opción de cada grupo obligatorio; precio copiado como lo haría la API.
  const item = (
    nombreEs: string,
    cantidad: number,
    estado: 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO',
    notas?: string,
  ) => {
    const plato = platos.find((x) => x.nombreEs === nombreEs)!;
    const mods = plato.grupos.filter((g) => g.obligatorio).map((g) => g.modificadores[0]!);
    return {
      platoId: plato.id,
      estacionId: plato.estacionId,
      cantidad,
      notas: notas ?? null,
      precioUnitario: plato.precio + mods.reduce((s, m) => s + m.precioExtra, 0),
      estado,
      enPreparacionEn: estado === 'PENDIENTE' ? null : hace(12),
      listoEn: estado === 'LISTO' || estado === 'ENTREGADO' ? hace(4) : null,
      entregadoEn: estado === 'ENTREGADO' ? hace(2) : null,
      modificadores: {
        create: mods.map((m) => ({
          modificadorId: m.id,
          nombre: m.nombreEs,
          precioExtra: m.precioExtra,
        })),
      },
    };
  };

  async function cuenta(
    numero: number,
    estado: 'ABIERTA' | 'PIDIO_CUENTA' | 'CERRADA',
    pedidos: { estado: 'PENDIENTE' | 'CONFIRMADO'; items: ReturnType<typeof item>[] }[],
  ) {
    const mesa = mesas.find((m) => m.numero === numero)!;
    const c = await tx.cuenta.create({
      data: {
        restauranteId,
        mesaId: mesa.id,
        estado,
        verificada: pedidos.some((p) => p.estado === 'CONFIRMADO'),
        abiertaEn: hace(40),
        ...(estado === 'CERRADA'
          ? { cerradaEn: hace(1), cerradaPorId: caja.id, metodoPago: 'EFECTIVO' as const }
          : {}),
      },
    });
    for (const [i, p] of pedidos.entries())
      await tx.pedido.create({
        data: {
          restauranteId,
          cuentaId: c.id,
          estado: p.estado,
          clientRequestId: `seed-${numero}-${i}`,
          confirmadoEn: p.estado === 'CONFIRMADO' ? hace(15) : null,
          confirmadoPorId: p.estado === 'CONFIRMADO' ? mesero.id : null,
          items: { create: p.items },
        },
      });
    const lineas = pedidos.filter((p) => p.estado === 'CONFIRMADO').flatMap((p) => p.items);
    await tx.cuenta.update({ where: { id: c.id }, data: calcularTotales(lineas, r) });
    return mesa;
  }

  await cuenta(1, 'ABIERTA', [
    {
      estado: 'CONFIRMADO',
      items: [
        item('Casado con bistec', 1, 'EN_PREPARACION', 'Sin cebolla'),
        item('Arroz con pollo', 1, 'LISTO'),
        item('Refresco natural', 2, 'ENTREGADO'),
      ],
    },
  ]);
  await cuenta(2, 'ABIERTA', [
    {
      estado: 'PENDIENTE',
      items: [item('Chifrijo', 1, 'PENDIENTE'), item('Café chorreado', 2, 'PENDIENTE')],
    },
  ]);
  const mesa4 = await cuenta(4, 'PIDIO_CUENTA', [
    {
      estado: 'CONFIRMADO',
      items: [item('Olla de carne', 2, 'ENTREGADO'), item('Agua dulce', 2, 'ENTREGADO')],
    },
  ]);
  await tx.llamada.create({ data: { restauranteId, mesaId: mesa4.id, tipo: 'CUENTA' } });
  const mesa5 = await cuenta(5, 'ABIERTA', [
    { estado: 'CONFIRMADO', items: [item('Gallo pinto con huevo', 1, 'PENDIENTE')] },
  ]);
  await tx.llamada.create({ data: { restauranteId, mesaId: mesa5.id, tipo: 'MESERO' } });
  await cuenta(6, 'CERRADA', [
    {
      estado: 'CONFIRMADO',
      items: [item('Casado con pollo', 2, 'ENTREGADO'), item('Café chorreado', 2, 'ENTREGADO')],
    },
  ]);
}
