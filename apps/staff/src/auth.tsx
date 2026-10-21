import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Rol } from '@menu-qr/shared';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

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

// El access token vive solo en memoria; el refresh token va en una cookie httpOnly.
let accessToken: string | null = null;

const post = (ruta: string, body?: unknown) =>
  fetch(`${API}${ruta}`, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

async function cargarUsuario(): Promise<Usuario | null> {
  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok ? (await res.json()).usuario : null;
}

// Una sola vez por carga de página: dos refresh simultáneos con la misma cookie
// se tomarían como reuso del token y la API cerraría todas las sesiones.
let sesionInicial: Promise<Usuario | null> | undefined;
const recuperarSesion = () =>
  (sesionInicial ??= post('/auth/refresh')
    .then(async (res) => {
      if (!res.ok) return null;
      accessToken = (await res.json()).accessToken;
      return cargarUsuario();
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

  const login = async (email: string, password: string) => {
    const res = await post('/auth/login', { email, password });
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.error?.message ?? 'No se pudo iniciar sesión');
    accessToken = datos.accessToken;
    setUsuario(datos.usuario);
  };

  const logout = async () => {
    await post('/auth/logout').catch(() => {});
    accessToken = null;
    setUsuario(null);
  };

  return <Ctx.Provider value={{ usuario, cargando, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx)!;
