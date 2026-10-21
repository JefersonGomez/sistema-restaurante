import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Socket } from 'socket.io-client';
import type { CuentaDetalle, MenuPublico, MesaPublica } from '@menu-qr/shared';
import { guardar, leer } from '../almacen';
import * as api from '../api';
import { avisar } from '../estado/avisos';
import { useCarrito } from '../estado/carrito';
import { useTextos } from '../estado/idioma';
import { pasoPedido } from '../lib/util';
import { olvidarEnvio } from './envio';

const claveSesion = (tokenQr: string) => `sesion:${tokenQr}`;
export const claves = {
  mesa: (tokenQr: string) => ['mesa', tokenQr] as const,
  menu: (slug: string) => ['menu', slug] as const,
  cuenta: (cuentaId: string) => ['cuenta', cuentaId] as const,
};

// No reintentar errores "definitivos" (mesa inexistente, sesión inválida, cuenta cerrada).
const reintentar = (n: number, e: unknown) =>
  !(e instanceof api.ErrorApi && [400, 401, 404, 410].includes(e.status)) && n < 2;

type Ctx = {
  tokenQr: string;
  mesa: MesaPublica | undefined;
  menu: MenuPublico | undefined;
  cuenta: CuentaDetalle | undefined;
  estado: 'cargando' | 'listo' | 'noEncontrado' | 'error' | 'cerrada';
  conectado: boolean;
  cerrarCuenta: () => void;
  refrescarCuenta: () => void;
  reintentar: () => void;
};

const MesaCtx = createContext<Ctx | null>(null);
export const useMesa = () => useContext(MesaCtx)!;

export function MesaProvider({ tokenQr, children }: { tokenQr: string; children: ReactNode }) {
  const qc = useQueryClient();
  const t = useTextos();
  const [cerrada, setCerrada] = useState(false);
  const [conectado, setConectado] = useState(true);

  // 1) Abrir u obtener la cuenta de la mesa (reutiliza la sesión guardada si sigue válida).
  const mesaQ = useQuery({
    queryKey: claves.mesa(tokenQr),
    queryFn: async () => {
      const m = await api.abrirMesa(tokenQr, leer<string>(claveSesion(tokenQr)));
      guardar(claveSesion(tokenQr), m.token);
      return m;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: reintentar,
  });
  const mesa = mesaQ.data;

  // 2) Menú y cuenta (la cuenta se vuelve a pedir al volver a la pestaña).
  const menuQ = useQuery({
    queryKey: claves.menu(mesa?.slug ?? ''),
    queryFn: () => api.obtenerMenu(mesa!.slug),
    enabled: !!mesa,
    staleTime: 60_000,
    retry: reintentar,
  });
  const cuentaQ = useQuery({
    queryKey: claves.cuenta(mesa?.cuentaId ?? ''),
    queryFn: () => api.verCuenta(mesa!.token),
    enabled: !!mesa && !cerrada,
    retry: reintentar,
  });

  const cerrarCuenta = useCallback(() => {
    guardar(claveSesion(tokenQr), null);
    if (mesa) {
      guardar(`carrito:${mesa.cuentaId}`, null);
      olvidarEnvio(mesa.cuentaId);
    }
    useCarrito.getState().vaciar();
    setCerrada(true);
  }, [tokenQr, mesa]);

  // Sesión vencida → pedir una nueva (misma cuenta). Cuenta cerrada → agradecimiento.
  const errorCuenta = cuentaQ.error;
  useEffect(() => {
    if (!(errorCuenta instanceof api.ErrorApi)) return;
    if (errorCuenta.status === 410) cerrarCuenta();
    if (errorCuenta.status === 401) {
      guardar(claveSesion(tokenQr), null);
      qc.invalidateQueries({ queryKey: claves.mesa(tokenQr) });
    }
  }, [errorCuenta, cerrarCuenta, qc, tokenQr]);

  useEffect(() => {
    if (mesa) useCarrito.getState().cargar(mesa.cuentaId);
  }, [mesa]);

  const refrescarCuenta = useCallback(() => {
    if (mesa) qc.invalidateQueries({ queryKey: claves.cuenta(mesa.cuentaId) });
  }, [qc, mesa]);

  // 3) Tiempo real: el socket solo avisa; los datos se vuelven a pedir por REST.
  const acciones = useRef({ refrescarCuenta, cerrarCuenta });
  acciones.current = { refrescarCuenta, cerrarCuenta };
  useEffect(() => {
    if (!mesa || cerrada) return;
    const { slug, token } = mesa;
    // socket.io-client se carga aparte para no demorar la primera pintura del menú.
    let socket: Socket | undefined;
    let desmontado = false;
    void import('socket.io-client').then(({ io }) => {
      if (!desmontado) escuchar((socket = io(api.API, { auth: { sesion: token } })));
    });
    const vistos = new Map<string, string>(); // evento:entidad → último updatedAt aplicado
    const esNuevo = (
      evento: string,
      p: { updatedAt?: string; itemId?: string; pedidoId?: string },
    ) => {
      const k = `${evento}:${p.itemId ?? p.pedidoId ?? 'cuenta'}`;
      if (!p.updatedAt) return true;
      const previo = vistos.get(k);
      if (previo && previo >= p.updatedAt) return false; // evento viejo o repetido
      vistos.set(k, p.updatedAt);
      return true;
    };
    let espera: ReturnType<typeof setTimeout>;
    const refrescar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => acciones.current.refrescarCuenta(), 150);
    };

    function escuchar(socket: Socket) {
      socket.on('connect', () => {
        setConectado(true);
        acciones.current.refrescarCuenta(); // resincroniza lo que pasó mientras estaba desconectado
      });
      socket.on('disconnect', () => setConectado(false));
      socket.on('connect_error', (e) => {
        setConectado(false);
        if (e.message === 'CUENTA_CERRADA') acciones.current.cerrarCuenta();
        if (e.message === 'SESION_INVALIDA') {
          guardar(claveSesion(tokenQr), null);
          qc.invalidateQueries({ queryKey: claves.mesa(tokenQr) });
        }
      });
      for (const ev of [
        'pedido:nuevo',
        'pedido:confirmado',
        'pedido:cancelado',
        'item:estado',
        'cuenta:actualizada',
      ])
        socket.on(ev, (p) => esNuevo(ev, p) && refrescar());
      socket.on('cuenta:cerrada', () => acciones.current.cerrarCuenta());
      // Plato agotado: se marca al instante en el menú y luego se refresca.
      socket.on(
        'menu:actualizado',
        (p: { platoId: string; agotado: boolean; updatedAt?: string }) => {
          if (!esNuevo('menu:actualizado', { ...p, itemId: p.platoId })) return;
          qc.setQueryData<MenuPublico>(
            claves.menu(slug),
            (m) =>
              m && {
                ...m,
                categorias: m.categorias.map((c) => ({
                  ...c,
                  platos: c.platos.map((x) =>
                    x.id === p.platoId ? { ...x, agotado: p.agotado } : x,
                  ),
                })),
              },
          );
          qc.invalidateQueries({ queryKey: claves.menu(slug) });
        },
      );
    }
    return () => {
      desmontado = true;
      clearTimeout(espera);
      socket?.disconnect();
    };
  }, [mesa, cerrada, qc, tokenQr]);

  // Aviso "Pedido #N: Listo" cuando un pedido pasa a listo.
  const pasosPrevios = useRef<Map<string, number | null> | null>(null);
  const pedidos = cuentaQ.data?.pedidos;
  useEffect(() => {
    if (!pedidos) return;
    const ahora = new Map(pedidos.map((p) => [p.id, pasoPedido(p)]));
    const antes = pasosPrevios.current;
    if (antes)
      pedidos.forEach((p, i) => {
        const previo = antes.get(p.id);
        if (ahora.get(p.id) === 3 && previo != null && previo < 3) avisar(t.pedidoListo(i + 1));
      });
    pasosPrevios.current = ahora;
  }, [pedidos, t]);

  const errorMesa = mesaQ.error;
  const estado: Ctx['estado'] = cerrada
    ? 'cerrada'
    : errorMesa instanceof api.ErrorApi && errorMesa.status === 404
      ? 'noEncontrado'
      : mesaQ.isError || menuQ.isError
        ? 'error'
        : mesa && menuQ.data
          ? 'listo'
          : 'cargando';

  const valor: Ctx = {
    tokenQr,
    mesa,
    menu: menuQ.data,
    cuenta: cuentaQ.data,
    estado,
    conectado,
    cerrarCuenta,
    refrescarCuenta,
    reintentar: () => qc.invalidateQueries(),
  };
  return <MesaCtx.Provider value={valor}>{children}</MesaCtx.Provider>;
}
