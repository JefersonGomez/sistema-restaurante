// Prueba de carga contra el entorno local (la API debe estar corriendo: `pnpm dev`).
//
//   pnpm --filter api simular            # 20 mesas, 5 minutos
//   MESAS=10 DURACION_SEG=60 pnpm --filter api simular
//
// Crea un restaurante aparte ("sim-hora-pico-…", se desactiva al final) para no tocar los datos
// de la Soda La Esquina, abre 20 mesas, envía pedidos aleatorios por HTTP y escucha por socket
// en cocina, bar, meseros, caja y los celulares de cada mesa. Mide latencias y verifica que
// no se perdió ni duplicó ningún pedido.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { io, type Socket } from 'socket.io-client';
import { prisma } from '../src/lib/prisma';
import { generarTokenQr } from '../src/lib/tokens';

const API = process.env.API_URL ?? 'http://localhost:4000';
const MESAS = Number(process.env.MESAS ?? 20);
const DURACION_MS = Number(process.env.DURACION_SEG ?? 300) * 1000;
const PAUSA_MS: [number, number] = [2000, 8000]; // entre pedidos de una misma mesa
const PROB_REENVIO = 0.1; // reenvía el mismo clientRequestId para probar idempotencia

const azar = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const elegir = <T>(xs: T[]) => xs[azar(0, xs.length - 1)]!;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stats = (xs: number[]) =>
  xs.length === 0
    ? 'sin datos'
    : (() => {
        const o = [...xs].sort((a, b) => a - b);
        const p = (q: number) => o[Math.min(o.length - 1, Math.floor(q * o.length))]!;
        return `n=${o.length}  prom=${Math.round(o.reduce((s, x) => s + x, 0) / o.length)} ms  p95=${p(0.95)} ms  máx=${o.at(-1)} ms`;
      })();

async function json<T>(
  ruta: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${ruta}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

const conectar = (auth: Record<string, string>) =>
  new Promise<Socket>((resolve, reject) => {
    const s = io(API, { auth, transports: ['websocket'] });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });

// --- Preparación: restaurante aislado con menú, personal y mesas ---
async function preparar() {
  const slug = `sim-hora-pico-${Date.now()}`;
  const password = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 4);
  const r = await prisma.restaurante.create({
    data: { nombre: 'Simulación hora pico', slug, modoConfirmacion: 'NUNCA' },
  });
  const restauranteId = r.id;
  const cocina = await prisma.estacion.create({ data: { restauranteId, nombre: 'Cocina' } });
  const bar = await prisma.estacion.create({ data: { restauranteId, nombre: 'Bar' } });
  const categoria = await prisma.categoria.create({
    data: { restauranteId, nombreEs: 'Todo', nombreEn: 'All' },
  });
  const nuevoPlato = (nombreEs: string, estacionId: string, precio: number) =>
    prisma.plato.create({
      data: {
        restauranteId,
        categoriaId: categoria.id,
        estacionId,
        nombreEs,
        nombreEn: nombreEs,
        precio,
      },
    });
  for (const [n, p] of [
    ['Casado', 480000],
    ['Chifrijo', 390000],
    ['Olla de carne', 520000],
  ] as const)
    await nuevoPlato(n, cocina.id, p);
  for (const [n, p] of [
    ['Refresco', 150000],
    ['Café', 120000],
  ] as const)
    await nuevoPlato(n, bar.id, p);
  const conGrupo = await nuevoPlato('Casado con bistec', cocina.id, 550000);
  await prisma.grupoModificadores.create({
    data: {
      restauranteId,
      platoId: conGrupo.id,
      nombreEs: 'Término',
      nombreEn: 'Doneness',
      obligatorio: true,
      minimo: 1,
      maximo: 1,
      modificadores: {
        create: ['Medio', 'Tres cuartos', 'Bien cocido'].map((n) => ({
          restauranteId,
          nombreEs: n,
          nombreEn: n,
        })),
      },
    },
  });

  const usuarios = Object.fromEntries(
    await Promise.all(
      (['DUENO', 'COCINA', 'MESERO', 'CAJA'] as const).map(async (rol) => {
        const email = `${rol.toLowerCase()}@${slug}.test`;
        await prisma.usuario.create({
          data: { restauranteId, rol, email, nombre: rol, passwordHash },
        });
        return [rol, email];
      }),
    ),
  ) as Record<'DUENO' | 'COCINA' | 'MESERO' | 'CAJA', string>;
  await prisma.mesa.createMany({
    data: Array.from({ length: MESAS }, (_, i) => ({
      restauranteId,
      numero: i + 1,
      tokenQr: generarTokenQr(),
    })),
  });
  const mesas = await prisma.mesa.findMany({
    where: { restauranteId },
    orderBy: { numero: 'asc' },
  });
  return { restauranteId, slug, password, usuarios, mesas };
}

async function main() {
  const salud = await fetch(`${API}/health`).catch(() => null);
  if (!salud?.ok) throw new Error(`La API no responde en ${API}. Levántela con "pnpm dev".`);

  const { restauranteId, slug, password, usuarios, mesas } = await preparar();
  console.log(`Restaurante de simulación: ${slug} · ${MESAS} mesas · ${DURACION_MS / 1000}s`);

  // Catálogo como lo ve el comensal.
  const { body: menu } = await json<{
    categorias: {
      platos: {
        id: string;
        grupos: {
          obligatorio: boolean;
          minimo: number;
          maximo: number;
          modificadores: { id: string }[];
        }[];
      }[];
    }[];
  }>(`/public/${slug}/menu`);
  const platos = menu.categorias.flatMap((c) => c.platos);

  // Personal escuchando.
  const token = async (email: string) =>
    (
      await json<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
    ).body.accessToken;
  const enviadoEn = new Map<string, number>(); // clientRequestId → ms de envío
  const pedidoDe = new Map<string, string>(); // pedidoId → clientRequestId
  const latEvento: number[] = [];
  const llegadasCocina = new Map<string, number>(); // pedidoId → veces recibido en la pantalla
  const pendientesDeMapear = new Map<string, number>(); // evento que llegó antes que la respuesta HTTP
  const cocina = await conectar({ token: await token(usuarios.COCINA) });
  cocina.on('pedido:confirmado', (p: { pedidoId: string }) => {
    const ahora = Date.now();
    const n = llegadasCocina.get(p.pedidoId) ?? 0;
    llegadasCocina.set(p.pedidoId, n + 1);
    const req = pedidoDe.get(p.pedidoId);
    if (n === 0 && req && enviadoEn.has(req)) latEvento.push(ahora - enviadoEn.get(req)!);
    else if (n === 0) pendientesDeMapear.set(p.pedidoId, ahora); // llegó antes que la respuesta HTTP
  });
  const personal = [cocina];
  for (const rol of ['MESERO', 'CAJA', 'DUENO'] as const)
    personal.push(await conectar({ token: await token(usuarios[rol]) }));

  // Comensales: una sesión y un socket por mesa.
  const sesiones = await Promise.all(
    mesas.map(
      async (m) =>
        (await json<{ token: string; cuentaId: string }>(`/public/mesa/${m.tokenQr}`)).body,
    ),
  );
  const avisosComensal = { n: 0 };
  const comensales = await Promise.all(sesiones.map((s) => conectar({ sesion: s.token })));
  comensales.forEach((s) => s.on('cuenta:actualizada', () => avisosComensal.n++));

  // Pedidos aleatorios.
  const latHttp: number[] = [];
  const creados = new Map<string, string>(); // clientRequestId → pedidoId
  const errores: string[] = [];
  let reenvios = 0;
  let reenviosDuplicados = 0;
  const fin = Date.now() + DURACION_MS;

  const pedidoAleatorio = () => ({
    clientRequestId: randomBytes(12).toString('hex'),
    items: Array.from({ length: azar(1, 4) }, () => {
      const p = elegir(platos);
      return {
        platoId: p.id,
        cantidad: azar(1, 3),
        modificadores: p.grupos.flatMap((g) =>
          g.obligatorio || g.minimo > 0 ? [elegir(g.modificadores).id] : [],
        ),
      };
    }),
  });

  async function mesaBot(sesion: { token: string }) {
    while (Date.now() < fin) {
      await dormir(azar(...PAUSA_MS));
      if (Date.now() >= fin) break;
      const pedido = pedidoAleatorio();
      const t0 = Date.now();
      enviadoEn.set(pedido.clientRequestId, t0);
      const r = await json<{ id: string }>('/public/cuenta/pedidos', {
        method: 'POST',
        token: sesion.token,
        body: JSON.stringify(pedido),
      }).catch((e: Error) => ({ status: 0, body: { id: '' }, error: e.message }));
      latHttp.push(Date.now() - t0);
      if (r.status !== 201) {
        errores.push(`HTTP ${r.status}`);
        continue;
      }
      creados.set(pedido.clientRequestId, r.body.id);
      pedidoDe.set(r.body.id, pedido.clientRequestId);
      const temprano = pendientesDeMapear.get(r.body.id);
      if (temprano) latEvento.push(temprano - t0);

      if (Math.random() < PROB_REENVIO) {
        reenvios++;
        const otra = await json<{ id: string }>('/public/cuenta/pedidos', {
          method: 'POST',
          token: sesion.token,
          body: JSON.stringify(pedido),
        });
        if (otra.status !== 200 || otra.body.id !== r.body.id) reenviosDuplicados++;
      }
    }
  }

  const progreso = setInterval(
    () =>
      console.log(
        `  … ${creados.size} pedidos creados, ${Math.max(0, Math.round((fin - Date.now()) / 1000))}s restantes`,
      ),
    30_000,
  );
  await Promise.all(sesiones.map(mesaBot));
  clearInterval(progreso);
  await dormir(3000); // últimos eventos en camino

  // Verificación contra la base de datos (fuente de verdad).
  const enBD = await prisma.pedido.findMany({
    where: { restauranteId },
    select: { id: true, clientRequestId: true, cuentaId: true },
  });
  const idsBD = new Set(enBD.map((p) => p.id));
  const duplicadosBD =
    enBD.length - new Set(enBD.map((p) => `${p.cuentaId}:${p.clientRequestId}`)).size;
  const perdidosBD = [...creados.values()].filter((id) => !idsBD.has(id)).length;
  const sobrantesBD = enBD.filter((p) => !creados.has(p.clientRequestId)).length;
  const sinEvento = [...idsBD].filter((id) => !llegadasCocina.has(id)).length;

  console.log('\n=== Resultado ===');
  console.log(`Pedidos enviados con éxito : ${creados.size}`);
  console.log(`Pedidos en la base de datos: ${enBD.length}`);
  console.log(
    `Errores HTTP               : ${errores.length}${errores.length ? ` (${[...new Set(errores)].join(', ')})` : ''}`,
  );
  console.log(`Reenvíos (idempotencia)    : ${reenvios}, duplicados: ${reenviosDuplicados}`);
  console.log(`Latencia creación (HTTP)   : ${stats(latHttp)}`);
  console.log(`Latencia evento a cocina   : ${stats(latEvento)}`);
  console.log(`Avisos a celulares         : ${avisosComensal.n}`);

  const ok =
    perdidosBD === 0 &&
    sobrantesBD === 0 &&
    duplicadosBD === 0 &&
    sinEvento === 0 &&
    reenviosDuplicados === 0;
  console.log(
    ok
      ? '\n✅ Sin pedidos perdidos ni duplicados; todos llegaron a la pantalla de cocina.'
      : `\n❌ perdidos=${perdidosBD} sobrantes=${sobrantesBD} duplicados=${duplicadosBD} sin evento=${sinEvento} reenvíos duplicados=${reenviosDuplicados}`,
  );

  [...personal, ...comensales].forEach((s) => s.disconnect());
  await prisma.restaurante.update({ where: { id: restauranteId }, data: { activo: false } });
  await prisma.$disconnect();
  process.exitCode = ok ? 0 : 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
