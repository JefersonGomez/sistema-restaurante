import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { borrarFotos } from './sinConexion';
import type { Rol } from '@menu-qr/shared';
import * as api from './api';

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  debeCambiarPassword: boolean;
  restaurante: {
    id: string;
    nombre: string;
    slug: string;
    plan: 'EN_LINEA' | 'BASICO' | 'COMPLETO';
    esDemo: boolean;
  } | null;
};

type Sesion = {
  usuario: Usuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  registrar: (datos: unknown) => Promise<void>;
  logout: () => Promise<void>;
  recargar: () => Promise<void>;
  entrarTablet: (accessToken: string, usuario: Usuario) => void;
  entrarDemo: (rol: string, cambiar?: boolean) => Promise<void>;
};

const Ctx = createContext<Sesion | null>(null);

// Una sola vez por carga de página (StrictMode monta dos veces los efectos en desarrollo).
let sesionInicial: Promise<Usuario | null> | undefined;
// Con la cookie de refresh (correo y contraseña) o, en una tablet, con la sesión del PIN guardada.
const yo = () => api.api<{ usuario: Usuario }>('/auth/me').then((r) => r.usuario);
// Sin internet al abrir (Fase 18): se sigue con el último usuario de este equipo; los datos los
// pide la pantalla y al volver la red la sesión se renueva sola con la cookie o la tablet.
const ultimoUsuario = () => api.leerFoto<Usuario>('usuario')?.d ?? null;
const recuperarSesion = () =>
  (sesionInicial ??= api
    .refrescar()
    .then((ok) => {
      if (ok) return yo();
      const tablet = api.sesionTablet();
      if (!tablet) return api.ultimoRefrescoSinRed() ? ultimoUsuario() : null;
      api.fijarToken(tablet);
      return yo();
    })
    .catch((e) => (e instanceof api.ErrorApi && e.status === 0 ? ultimoUsuario() : null)));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al abrir la app se intenta recuperar la sesión con la cookie de refresh.
  useEffect(() => {
    recuperarSesion()
      .then(setUsuario)
      .finally(() => setCargando(false));
  }, []);
  // Se recuerda quién usa el equipo para abrir sin internet; se borra al cerrar sesión.
  useEffect(() => {
    if (usuario) api.guardarFoto('usuario', usuario);
  }, [usuario]);

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
  const entrarDemo = async (rol: string, cambiar = false) => {
    const [u] = await Promise.all([
      api.entrarDemo(rol, cambiar),
      new Promise((r) => setTimeout(r, 700)),
    ]);
    setUsuario(u);
  };
  const logout = async () => {
    await api.logout();
    borrarFotos();
    setUsuario(null);
  };

  const entrarTablet = (accessToken: string, u: Usuario) => {
    api.guardarSesionTablet(accessToken);
    setUsuario(u);
  };

  const recargar = async () =>
    setUsuario((await api.api<{ usuario: Usuario }>('/auth/me')).usuario);

  return (
    <Ctx.Provider
      value={{ usuario, cargando, login, registrar, logout, recargar, entrarTablet, entrarDemo }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx)!;
