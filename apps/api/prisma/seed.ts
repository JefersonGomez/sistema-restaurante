import bcrypt from 'bcryptjs';
import type { Prisma } from '../src/generated/prisma/client';
import { calcularTotales } from '@menu-qr/shared';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/lib/env';
import { generarTokenQr } from '../src/lib/tokens';

// Credenciales de prueba (documentadas en el README). Solo para desarrollo.
const USUARIOS_DEMO = [
  { rol: 'DUENO', nombre: 'Doña Marta', email: 'dueno@sodalaesquina.test', password: 'Dueno123!' },
  { rol: 'MESERO', nombre: 'Andrés', email: 'mesero@sodalaesquina.test', password: 'Mesero123!' },
  { rol: 'COCINA', nombre: 'Lucía', email: 'cocina@sodalaesquina.test', password: 'Cocina123!' },
  { rol: 'CAJA', nombre: 'Carlos', email: 'caja@sodalaesquina.test', password: 'Caja123!' },
] as const;

const SLUG = 'soda-la-esquina';
const colones = (monto: number) => monto * 100; // a céntimos

async function main() {
  await prisma.usuario.upsert({
    where: { email: 'admin@menuqr.test' },
    update: {},
    create: {
      nombre: 'Superadmin',
      email: 'admin@menuqr.test',
      passwordHash: await bcrypt.hash('Admin123!', 10),
      rol: 'SUPERADMIN',
    },
  });

  // Idempotente: si el restaurante demo ya existe no se toca.
  let restaurante = await prisma.restaurante.findUnique({ where: { slug: SLUG } });
  if (!restaurante) {
    restaurante = await prisma.$transaction(crearRestauranteDemo, { timeout: 30_000 });
    console.log('Restaurante demo creado.');
  } else {
    console.log('Restaurante demo ya existía, no se modificó.');
  }

  const mesas = await prisma.mesa.findMany({
    where: { restauranteId: restaurante.id },
    orderBy: { numero: 'asc' },
  });
  console.log('\nMesas (abrir en el navegador):');
  for (const m of mesas) console.log(`  Mesa ${m.numero}: ${env.MENU_PUBLIC_URL}/m/${m.tokenQr}`);
}

async function crearRestauranteDemo(tx: Prisma.TransactionClient) {
  const restaurante = await tx.restaurante.create({
    data: {
      nombre: 'Soda La Esquina',
      slug: SLUG,
      moneda: 'CRC',
      colorPrimario: '#b45309',
      preciosIncluyenImpuestos: true,
    },
  });
  const restauranteId = restaurante.id;

  for (const u of USUARIOS_DEMO) {
    await tx.usuario.create({
      data: {
        restauranteId,
        rol: u.rol,
        nombre: u.nombre,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
  }

  const cocina = await tx.estacion.create({ data: { restauranteId, nombre: 'Cocina' } });
  const bar = await tx.estacion.create({ data: { restauranteId, nombre: 'Bar' } });

  const categoria = (orden: number, nombreEs: string, nombreEn: string) =>
    tx.categoria.create({ data: { restauranteId, orden, nombreEs, nombreEn } });
  const desayunos = await categoria(1, 'Desayunos', 'Breakfast');
  const fuertes = await categoria(2, 'Platos fuertes', 'Main dishes');
  const bocas = await categoria(3, 'Bocas', 'Appetizers');
  const bebidas = await categoria(4, 'Bebidas', 'Drinks');

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

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
