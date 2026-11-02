import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Rol } from '@menu-qr/shared';
import * as api from './api';

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  debeCambiarPassword: boolean;
  restaurante: { id: string; nombre: string; slug: string; plan: 'BASICO' | 'COMPLETO' } | null;
};

type Sesion = {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  registrar: (datos: unknown) => Promise<void>;
  logout: () => Promise<void>;
  recargar: () => Promise<void>;
  entrarTablet: (accessToken: string, usuario: Usuario) => void;
};

const Ctx = createContext<Sesion | null>(null);

// Una sola vez por carga de página (StrictMode monta dos veces los efectos en desarrollo).
let sesionInicial: Promise<Usuario | null> | undefined;
// Con la cookie de refresh (correo y contraseña) o, en una tablet, con la sesión del PIN guardada.
const yo = () => api.api<{ usuario: Usuario }>('/auth/me').then((r) => r.usuario);
const recuperarSesion = () =>
  (sesionInicial ??= api
    .refrescar()
    .then((ok) => {
      if (ok) return yo();
      const tablet = api.sesionTablet();
      if (!tablet) return null;
      api.fijarToken(tablet);
      return yo();
    })
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

  // La animación de "entrando" se ve al menos un momento (si el login falla, el error sale ya).
  const login = async (email: string, password: string) => {
    const [u] = await Promise.all([
      api.login(email, password),
      new Promise((r) => setTimeout(r, 700)),
    ]);
    setUsuario(u);
  };
  const registrar = async (datos: unknown) => {
    const [u] = await Promise.all([api.registro(datos), new Promise((r) => setTimeout(r, 700))]);
    setUsuario(u);
  };
  const logout = async () => {
    await api.logout();
    setUsuario(null);
  };

  const entrarTablet = (accessToken: string, u: Usuario) => {
    api.guardarSesionTablet(accessToken);
    setUsuario(u);
  };

  const recargar = async () =>
    setUsuario((await api.api<{ usuario: Usuario }>('/auth/me')).usuario);

  return (
    <Ctx.Provider value={{ usuario, cargando, login, registrar, logout, recargar, entrarTablet }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx)!;
