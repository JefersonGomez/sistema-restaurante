import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Rol } from '@menu-qr/shared';
import * as api from './api';

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  restaurante: { id: string; nombre: string; slug: string } | null;
};

type Sesion = {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<Sesion | null>(null);

// Una sola vez por carga de página (StrictMode monta dos veces los efectos en desarrollo).
let sesionInicial: Promise<Usuario | null> | undefined;
const recuperarSesion = () =>
  (sesionInicial ??= api
    .refrescar()
    .then((ok) => (ok ? api.api<{ usuario: Usuario }>('/auth/me').then((r) => r.usuario) : null))
    .catch(() => null));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al abrir la app se intenta recuperar la sesión con la cookie de refresh.
  useEffect(() => {
    recuperarSesion()
      .then(setUsuario)
      .finally(() => setCargando(false));
  }, []);

  const login = async (email: string, password: string) =>
    setUsuario(await api.login(email, password));
  const logout = async () => {
    await api.logout();
    setUsuario(null);
  };

  return <Ctx.Provider value={{ usuario, cargando, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx)!;
