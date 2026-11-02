import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { hashToken, verificarAccessToken } from '../lib/tokens';
import { dispositivoVigente } from '../middlewares/auth';

// Salas:
//   rest:{id}                     todo el personal del restaurante
//   rest:{id}:meseros | :caja | :repartidores
//   rest:{id}:estacion:{estId}    pantallas de cocina y bar
//   rest:{id}:comensales          todos los celulares de comensales (menu:actualizado)
//   cuenta:{cuentaId}             celulares de una mesa
//   disp:{dispositivoId}          la tablet vinculada (para cortarla al revocarla)
export type Sala =
  'todos' | 'meseros' | 'caja' | 'repartidores' | 'comensales' | { estacion: string };

const nombreSala = (restauranteId: string, sala: Sala) =>
  sala === 'todos'
    ? `rest:${restauranteId}`
    : typeof sala === 'object'
      ? `rest:${restauranteId}:estacion:${sala.estacion}`
      : `rest:${restauranteId}:${sala}`;

let io: Server | undefined;

// Personal: `auth.token` = access token (JWT).
async function salasDePersonal(token: string) {
  const { id, rol, restauranteId, dispositivoId, estacionId } = verificarAccessToken(token);
  if (!restauranteId) throw new Error('SIN_RESTAURANTE');
  if (dispositivoId && !(await dispositivoVigente(dispositivoId)))
    throw new Error('DISPOSITIVO_REVOCADO');
  const usuario = await prisma.usuario.findFirst({
    where: { id, restauranteId, activo: true },
    select: { estacionId: true },
  });
  if (!usuario) throw new Error('NO_AUTENTICADO');

  // Tablet vinculada: solo la estación del dispositivo.
  if (dispositivoId)
    return [
      nombreSala(restauranteId, 'todos'),
      nombreSala(restauranteId, { estacion: estacionId! }),
      `disp:${dispositivoId}`,
    ];

  const salas: Sala[] = ['todos'];
  if (rol === 'DUENO' || rol === 'MESERO') salas.push('meseros');
  if (rol === 'DUENO' || rol === 'CAJA') salas.push('caja');
  if (rol === 'REPARTIDOR') salas.push('repartidores');
  if (rol === 'DUENO' || rol === 'COCINA') {
    // COCINA con estación asignada solo entra a la suya; sin estación (o DUENO), a todas.
    const estaciones =
      rol === 'COCINA' && usuario.estacionId
        ? [{ id: usuario.estacionId }]
        : await prisma.estacion.findMany({ where: { restauranteId }, select: { id: true } });
    salas.push(...estaciones.map((e) => ({ estacion: e.id })));
  }
  return salas.map((s) => nombreSala(restauranteId, s));
}

// Comensal: `auth.sesion` = token de sesión de cliente. Solo su cuenta (y avisos de menú).
async function salasDeComensal(token: string) {
  const sesion = await prisma.sesionCliente.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { cuenta: { select: { id: true, estado: true, restauranteId: true } } },
  });
  if (!sesion || sesion.revocada || sesion.expiraEn < new Date())
    throw new Error('SESION_INVALIDA');
  if (sesion.cuenta.estado === 'CERRADA') throw new Error('CUENTA_CERRADA');
  return [`cuenta:${sesion.cuenta.id}`, nombreSala(sesion.cuenta.restauranteId, 'comensales')];
}

export function iniciarRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.CORS_ORIGINS, credentials: true } });

  io.use(async (socket: Socket, next) => {
    const { token, sesion } = (socket.handshake.auth ?? {}) as { token?: string; sesion?: string };
    try {
      if (token) socket.data.salas = await salasDePersonal(String(token));
      else if (sesion) socket.data.salas = await salasDeComensal(String(sesion));
      else throw new Error('NO_AUTENTICADO');
      next();
    } catch (e) {
      const msg = (e as Error).message;
      next(
        new Error(
          ['SIN_RESTAURANTE', 'SESION_INVALIDA', 'CUENTA_CERRADA', 'DISPOSITIVO_REVOCADO'].includes(
            msg,
          )
            ? msg
            : 'NO_AUTENTICADO',
        ),
      );
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.salas as string[]);
    socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));
  });

  logger.info('Socket.IO listo');
  return io;
}

// Emitir SIEMPRE después de que la transacción se confirmó: la BD es la fuente de verdad,
// el socket solo avisa. No-op si no hay servidor de sockets (tests HTTP).
export function emitToRestaurant(
  restauranteId: string,
  sala: Sala,
  evento: string,
  payload: unknown,
) {
  io?.to(nombreSala(restauranteId, sala)).emit(evento, payload);
}

export function emitToCuenta(cuentaId: string, evento: string, payload: unknown) {
  io?.to(`cuenta:${cuentaId}`).emit(evento, payload);
}

// Al revocar una tablet se cortan sus conexiones abiertas.
export function desconectarDispositivo(dispositivoId: string) {
  io?.in(`disp:${dispositivoId}`).disconnectSockets(true);
}
