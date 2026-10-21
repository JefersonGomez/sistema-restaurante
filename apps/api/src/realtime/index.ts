import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Rol } from '@menu-qr/shared';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { verificarAccessToken } from '../lib/tokens';

export type Sala = 'cocina' | 'bar' | 'meseros' | 'caja' | 'todos';

// Salas por rol. Todos entran además a `rest:{id}` (sala 'todos').
const SALAS_POR_ROL: Record<Rol, Exclude<Sala, 'todos'>[]> = {
  SUPERADMIN: [],
  DUENO: ['cocina', 'bar', 'meseros', 'caja'],
  MESERO: ['meseros'],
  COCINA: ['cocina', 'bar'], // no hay rol BAR: cocina ve también el bar
  CAJA: ['caja'],
};

const nombreSala = (restauranteId: string, sala: Sala) =>
  sala === 'todos' ? `rest:${restauranteId}` : `rest:${restauranteId}:${sala}`;

let io: Server | undefined;

export function iniciarRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.CORS_ORIGINS, credentials: true } });

  // Handshake: el personal manda su access token en `auth.token`.
  io.use((socket, next) => {
    try {
      const usuario = verificarAccessToken(String(socket.handshake.auth?.token ?? ''));
      if (!usuario.restauranteId) return next(new Error('SIN_RESTAURANTE'));
      socket.data.usuario = usuario;
      next();
    } catch {
      next(new Error('NO_AUTENTICADO'));
    }
  });

  io.on('connection', (socket) => {
    const { rol, restauranteId } = socket.data.usuario as { rol: Rol; restauranteId: string };
    socket.join([
      nombreSala(restauranteId, 'todos'),
      ...SALAS_POR_ROL[rol].map((s) => nombreSala(restauranteId, s)),
    ]);
    socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));
  });

  logger.info('Socket.IO listo');
  return io;
}

// Para la Fase 2 (pedidos a cocina/bar, llamadas a meseros, etc.).
export function emitToRestaurant(
  restauranteId: string,
  sala: Sala,
  evento: string,
  payload: unknown,
) {
  io?.to(nombreSala(restauranteId, sala)).emit(evento, payload);
}
