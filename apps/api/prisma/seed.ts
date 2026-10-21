import bcrypt from 'bcryptjs';
import type { Prisma } from '../src/generated/prisma/client';
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

  return restaurante;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
