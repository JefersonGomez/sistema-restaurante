import { useSyncExternalStore } from 'react';
import { sonar, vibrar } from './alertas';

// Centro de avisos del personal: vive fuera de las pantallas, así la campanita conserva sus
// avisos aunque se cambie de pantalla. Cada aviso suena y vibra una vez y, si se dio permiso,
// también sale como notificación del sistema.

export type TipoAviso = 'llamada' | 'cuenta' | 'pedido' | 'cocina' | 'listo' | 'reparto';
export type Aviso = { id: number; tipo: TipoAviso; texto: string; fecha: number; leido: boolean };

const MAXIMO = 30;
let avisos: Aviso[] = [];
let siguiente = 1;
const oyentes = new Set<() => void>();
const cambiar = (nuevos: Aviso[]) => {
  avisos = nuevos;
  oyentes.forEach((f) => f());
};

// Las notificaciones del sistema solo existen en contexto seguro (https o localhost).
export const notificacionesDisponibles = () =>
  typeof Notification !== 'undefined' && window.isSecureContext;
export const notificacionesActivas = () =>
  notificacionesDisponibles() && Notification.permission === 'granted';
export const pedirPermisoNotificaciones = async () => {
  if (notificacionesDisponibles() && Notification.permission === 'default')
    await Notification.requestPermission();
};

// `tonos`: cuántos pitidos (los avisos más urgentes, más). Repetir el mismo texto seguido no
// vuelve a sonar (p. ej. dos eventos del mismo pedido).
export function avisar(tipo: TipoAviso, texto: string, tonos = 2) {
  const ultimo = avisos[0];
  if (ultimo && ultimo.texto === texto && Date.now() - ultimo.fecha < 5000) return;
  cambiar(
    [{ id: siguiente++, tipo, texto, fecha: Date.now(), leido: false }, ...avisos].slice(0, MAXIMO),
  );
  sonar(tonos);
  vibrar();
  if (notificacionesActivas() && document.visibilityState !== 'visible')
    new Notification('KitchaGo', { body: texto, tag: tipo, icon: '/icono.svg' });
}

export const marcarLeidos = () => cambiar(avisos.map((a) => ({ ...a, leido: true })));
export const borrarAvisos = () => cambiar([]);

export function useAvisos() {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => avisos,
  );
}
