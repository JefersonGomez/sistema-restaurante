import type { MenuPublico } from '@menu-qr/shared';

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ErrorApi extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { intentosRestantes?: number },
  ) {
    super(message);
  }
}

// El access token vive solo en memoria; el refresh token va en una cookie httpOnly.
let accessToken: string | null = null;
export const obtenerToken = () => accessToken;
export const fijarToken = (t: string | null) => {
  accessToken = t;
};

const post = (ruta: string, body?: unknown) =>
  fetch(`${API}${ruta}`, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

// Un solo refresh a la vez: dos simultáneos con la misma cookie se tomarían como reuso del token
// y la API cerraría todas las sesiones.
let refrescando: Promise<boolean> | null = null;
export function refrescar() {
  refrescando ??= post('/auth/refresh')
    .then(async (res) => {
      fijarToken(res.ok ? (await res.json()).accessToken : null);
      return res.ok;
    })
    .catch(() => false)
    .finally(() => {
      refrescando = null;
    });
  return refrescando;
}

export async function login(email: string, password: string) {
  const res = await post('/auth/login', { email, password });
  const datos = await res.json();
  if (!res.ok) throw new ErrorApi(res.status, datos.error?.code, datos.error?.message ?? 'Error');
  fijarToken(datos.accessToken);
  return datos.usuario;
}

export async function logout() {
  await post('/auth/logout').catch(() => {});
  fijarToken(null);
  guardar(CLAVE_SESION_TABLET, null);
}

// --- Tablet de cocina vinculada ---
// El token del dispositivo vive en localStorage (es de larga duración: es lo que "vincula" la
// tablet). La sesión del cocinero (12 h) también, para no pedir el PIN en cada recarga.
const CLAVE_TABLET = 'tabletCocina';
const CLAVE_SESION_TABLET = 'tabletSesion';
const leer = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const guardar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: se vuelve a vincular o a poner el PIN */
  }
};
export const tokenTablet = () => leer(CLAVE_TABLET);
export const guardarTokenTablet = (t: string | null) => guardar(CLAVE_TABLET, t);
export const sesionTablet = () => leer(CLAVE_SESION_TABLET);
export const guardarSesionTablet = (accessToken: string) => {
  guardar(CLAVE_SESION_TABLET, accessToken);
  fijarToken(accessToken);
};

// La tablet fue desvinculada o su sesión venció: se vuelve a la pantalla de PIN / vincular.
function volverATablet(revocada: boolean) {
  if (revocada) guardarTokenTablet(null);
  guardar(CLAVE_SESION_TABLET, null);
  fijarToken(null);
  location.assign('/tablet');
}
export const alRechazoDeSocket = (codigo: string) =>
  codigo === 'DISPOSITIVO_REVOCADO' && volverATablet(true);

export async function apiTablet<T>(ruta: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/dispositivos${ruta}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'X-Dispositivo': tokenTablet() ?? '',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ErrorApi(0, 'RED', 'Sin conexión');
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok)
    throw new ErrorApi(
      res.status,
      datos?.error?.code ?? 'ERROR',
      datos?.error?.message ?? 'Error',
      datos?.error?.details,
    );
  return datos as T;
}

// Llamada autenticada; si el access token venció, refresca una vez y reintenta.
export async function api<T>(
  ruta: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const enviar = () =>
    fetch(`${API}${ruta}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  let res: Response;
  try {
    res = await enviar();
    if (res.status === 401 && (await refrescar())) res = await enviar();
  } catch {
    throw new ErrorApi(0, 'RED', 'Sin conexión');
  }
  const datos = await res.json().catch(() => null);
  if (res.status === 401 && sesionTablet())
    volverATablet(datos?.error?.code === 'DISPOSITIVO_REVOCADO');
  if (!res.ok)
    throw new ErrorApi(res.status, datos?.error?.code ?? 'ERROR', datos?.error?.message ?? 'Error');
  return datos as T;
}

// Catálogo y configuración del restaurante (moneda, impuestos), del endpoint público.
let menuCache: { slug: string; menu: Promise<MenuPublico> } | null = null;
export function obtenerMenu(slug: string, recargar = false) {
  if (!menuCache || menuCache.slug !== slug || recargar)
    menuCache = {
      slug,
      menu: fetch(`${API}/public/${encodeURIComponent(slug)}/menu`).then((r) => {
        if (!r.ok) throw new ErrorApi(r.status, 'ERROR', 'No se pudo cargar el menú');
        return r.json();
      }),
    };
  return menuCache.menu;
}

// Sube una imagen (multipart) a /uploads/imagen. Plato → { url320, url960 }; logo → { url }.
export async function subirImagen<T>(archivo: File, destino: 'plato' | 'logo'): Promise<T> {
  const enviar = () => {
    const datos = new FormData();
    datos.append('imagen', archivo);
    return fetch(`${API}/uploads/imagen?destino=${destino}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: datos,
    });
  };
  let res: Response;
  try {
    res = await enviar();
    if (res.status === 401 && (await refrescar())) res = await enviar();
  } catch {
    throw new ErrorApi(0, 'RED', 'Sin conexión');
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok)
    throw new ErrorApi(res.status, datos?.error?.code ?? 'ERROR', datos?.error?.message ?? 'Error');
  return datos as T;
}

// Descarga un archivo autenticado (p. ej. el PDF de los QR) y lo guarda con `nombre`.
export async function descargar(ruta: string, nombre: string) {
  const pedir = () =>
    fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  let res = await pedir();
  if (res.status === 401 && (await refrescar())) res = await pedir();
  if (!res.ok) {
    const datos = await res.json().catch(() => null);
    throw new ErrorApi(
      res.status,
      datos?.error?.code ?? 'ERROR',
      datos?.error?.message ?? 'No se pudo descargar',
    );
  }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
