import type { MenuPublico, MesaPublica } from '@menu-qr/shared';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function get<T>(ruta: string): Promise<T> {
  const res = await fetch(`${API}${ruta}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'no-encontrado' : 'error');
  return res.json();
}

export const obtenerMesa = (token: string) =>
  get<MesaPublica>(`/public/mesa/${encodeURIComponent(token)}`);

export const obtenerMenu = (slug: string) =>
  get<MenuPublico>(`/public/${encodeURIComponent(slug)}/menu`);
