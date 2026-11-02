import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { guardar, leer } from '../almacen';
import * as api from '../api';

// Sesión de la cuenta del cliente: un token por restaurante, guardado en este celular.
const clave = (slug: string) => `cliente:${slug}`;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function useTokenCliente(slug: string) {
  const token = useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => leer<string>(clave(slug)),
  );
  const poner = useCallback(
    (t: string | null) => {
      guardar(clave(slug), t);
      avisar();
    },
    [slug],
  );
  return [token, poner] as const;
}

// Perfil de la cuenta abierta (null sin sesión). Si la sesión ya no sirve, se olvida.
export function usePerfilCliente(slug: string) {
  const [token, poner] = useTokenCliente(slug);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['perfil', slug, token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      try {
        return await api.perfilCliente(slug, token!);
      } catch (e) {
        if (e instanceof api.ErrorApi && e.status === 401) poner(null);
        throw e;
      }
    },
  });
  const salir = async () => {
    if (token) await api.salirCliente(slug, token);
    poner(null);
    qc.removeQueries({ queryKey: ['perfil', slug] });
  };
  return { token, poner, perfil: token ? (q.data ?? null) : null, cargando: q.isLoading, salir };
}
