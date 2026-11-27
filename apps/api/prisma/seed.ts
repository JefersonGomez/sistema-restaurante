import bcrypt from 'bcryptjs';
import { montoSugerido, nuevoVencimiento } from '@menu-qr/shared';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/lib/env';
import {
  crearRestauranteDemo,
  enLineaDemo,
  fotosDePlatos,
  historial,
  personalizacionDemo,
  tabletDemo,
  type UsuarioDemo,
} from '../src/modules/demo/datos';

// Credenciales de prueba (documentadas en el README). Solo para desarrollo.
const USUARIOS_DEMO = [
  { rol: 'DUENO', nombre: 'Doña Marta', email: 'dueno@sodalaesquina.test', password: 'Dueno123!' },
  { rol: 'MESERO', nombre: 'Andrés', email: 'mesero@sodalaesquina.test', password: 'Mesero123!' },
  { rol: 'COCINA', nombre: 'Lucía', email: 'cocina@sodalaesquina.test', password: 'Cocina123!' },
  { rol: 'CAJA', nombre: 'Carlos', email: 'caja@sodalaesquina.test', password: 'Caja123!' },
  {
    rol: 'REPARTIDOR',
    nombre: 'Pepe',
    email: 'repartidor@sodalaesquina.test',
    password: 'Repartidor123!',
  },
] as const;
const PIN_COCINA = '1234';
// Cliente con cuenta en el menú en línea (/r/soda-la-esquina → Entrar).
const CLIENTE_DEMO = {
  nombre: 'Laura Cliente',
  email: 'cliente@correo.test',
  password: 'Cliente123!',
  telefono: '8800 1122',
  telefonoNormal: '88001122',
  direccion: 'Del Más x Menos 100 m este, casa amarilla',
};

const SLUG = 'soda-la-esquina';

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
    const usuarios: UsuarioDemo[] = [];
    for (const u of USUARIOS_DEMO)
      usuarios.push({
        rol: u.rol,
        nombre: u.nombre,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
        // PIN para entrar en la tablet de cocina (Panel → Dispositivos).
        pinHash: u.rol === 'COCINA' ? await bcrypt.hash(PIN_COCINA, 10) : null,
      });
    restaurante = await prisma.$transaction(
      (tx) => crearRestauranteDemo(tx, { nombre: 'Soda La Esquina', slug: SLUG, usuarios }),
      { timeout: 30_000 },
    );
    console.log('Restaurante demo creado.');
  } else {
    console.log('Restaurante demo ya existía: solo se completa lo que falte.');
  }

  // Se agregan si faltan (sirve también sobre una base de desarrollo ya sembrada).
  const fotos = await fotosDePlatos(restaurante.id);
  if (fotos) console.log(`Fotos generadas para ${fotos} platos.`);
  if (await tabletDemo(restaurante.id)) console.log('Tablet de cocina vinculada.');
  if (await personalizacionDemo(restaurante.id))
    console.log('Personalización de ejemplo: banner, eslogan, teléfono y dirección.');
  if (await enLineaDemo(restaurante.id))
    console.log('Pedidos en línea activados (para recoger y a domicilio).');
  // Usuarios demo que se sumaron después (p. ej. el repartidor de la Fase 7).
  for (const u of USUARIOS_DEMO) {
    if (await prisma.usuario.findUnique({ where: { email: u.email } })) continue;
    await prisma.usuario.create({
      data: {
        restauranteId: restaurante.id,
        rol: u.rol,
        nombre: u.nombre,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 10),
      },
    });
    console.log(`Usuario demo agregado: ${u.email}`);
  }
  // Fase 9: la soda demo queda al día con un pago anual del plan Completo.
  if (!(await prisma.pagoSuscripcion.count({ where: { restauranteId: restaurante.id } }))) {
    const hasta = nuevoVencimiento(null, 12);
    await prisma.$transaction([
      prisma.pagoSuscripcion.create({
        data: {
          restauranteId: restaurante.id,
          plan: 'COMPLETO',
          meses: 12,
          monto: montoSugerido('COMPLETO', 12),
          metodo: 'SINPE',
          referencia: 'demo',
          desde: new Date(),
          hasta,
        },
      }),
      prisma.restaurante.update({
        where: { id: restaurante.id },
        data: { plan: 'COMPLETO', planVenceEn: hasta },
      }),
    ]);
    console.log('Suscripción demo: plan Completo pagado por 12 meses.');
  }
  // Fase 8: tarjeta de sellos (si nunca se configuró) y un cliente con cuenta en el menú en línea.
  if (!restaurante.premioFidelidad) {
    await prisma.restaurante.update({
      where: { id: restaurante.id },
      data: { fidelidadActiva: true, sellosMeta: 5, premioFidelidad: 'Un fresco natural gratis' },
    });
    console.log('Tarjeta de sellos activada (5 sellos: un fresco natural gratis).');
  }
  const clienteDemo = { ...CLIENTE_DEMO, restauranteId: restaurante.id };
  if (
    !(await prisma.clienteRegistrado.findUnique({
      where: { restauranteId_email: { restauranteId: restaurante.id, email: clienteDemo.email } },
    }))
  ) {
    const { password, ...datos } = clienteDemo;
    await prisma.clienteRegistrado.create({
      data: { ...datos, passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`Cliente demo del menú en línea: ${clienteDemo.email}`);
  }
  const cuentas = await historial(restaurante);
  if (cuentas) console.log(`Historial: ${cuentas} cuentas cerradas en los últimos 30 días.`);

  const mesas = await prisma.mesa.findMany({
    where: { restauranteId: restaurante.id },
    orderBy: { numero: 'asc' },
  });
  console.log('\nMesas (abrir en el navegador):');
  for (const m of mesas) console.log(`  Mesa ${m.numero}: ${env.MENU_PUBLIC_URL}/m/${m.tokenQr}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
