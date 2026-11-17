import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { alRechazoDeSocket, API, obtenerToken, refrescar } from './api';

type Manejadores = Record<string, (payload: never) => void>;

// Socket del personal. La BD es la fuente de verdad: en cada (re)conexión se llama a `alConectar`
// para volver a pedir todo por REST, así nada se pierde mientras estuvo desconectado.
export function useTiempoReal(manejadores: Manejadores, alConectar: () => void) {
  const [conectado, setConectado] = useState(false);
  const ref = useRef({ manejadores, alConectar });
  ref.current = { manejadores, alConectar };
  const eventos = Object.keys(manejadores).join(',');

  useEffect(() => {
    // `auth` como función: cada reintento usa el access token vigente.
    const socket = io(API, { auth: (cb) => cb({ token: obtenerToken() }) });
    let cerrado = false;
    socket.on('connect', () => {
      setConectado(true);
      ref.current.alConectar();
    });
    socket.on('disconnect', () => setConectado(false));
    // El servidor corta el socket cuando el dueño revoca la tablet.
    socket.on(
      'disconnect',
      (motivo) => motivo === 'io server disconnect' && ref.current.alConectar(),
    );
    socket.on('connect_error', async (e) => {
      setConectado(false);
      alRechazoDeSocket(e.message);
      // Error de red: Socket.IO reintenta solo. Rechazo del servidor (p. ej. token vencido):
      // no reintenta, así que se refresca el token y se reconecta a mano.
      if (socket.active) return;
      await refrescar();
      setTimeout(() => !cerrado && socket.connect(), 1000);
    });
    for (const ev of eventos.split(',').filter(Boolean))
      socket.on(ev, (p: unknown) => {
        ref.current.manejadores[ev]?.(p as never);
      });
    // Al volver la red o la pestaña, resincroniza aunque el socket no haya notado el corte.
    const resincronizar = () => document.visibilityState === 'visible' && ref.current.alConectar();
    window.addEventListener('online', resincronizar);
    document.addEventListener('visibilitychange', resincronizar);
    // Las acciones guardadas sin conexión ya llegaron: recargar para ver el estado real.
    const recargar = () => ref.current.alConectar();
    window.addEventListener('kitchago:cola-enviada', recargar);
    return () => {
      cerrado = true;
      window.removeEventListener('online', resincronizar);
      document.removeEventListener('visibilitychange', resincronizar);
      window.removeEventListener('kitchago:cola-enviada', recargar);
      socket.disconnect();
    };
  }, [eventos]);

  return conectado;
}

// Agrupa avisos seguidos en un solo refresco.
export function useRefrescoAgrupado(fn: () => void, ms = 150) {
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => () => clearTimeout(t.current), []);
  return () => {
    clearTimeout(t.current);
    t.current = setTimeout(() => f.current(), ms);
  };
}
