import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import * as api from '../api';
import { avisar } from '../estado/avisos';
import { useCarrito } from '../estado/carrito';
import { useTextos } from '../estado/idioma';
import {
  enviarConReintentos,
  envioPendiente,
  esReintentable,
  olvidarEnvio,
  prepararEnvio,
} from './envio';
import { claves, useMesa } from './mesa';

type EstadoEnvio = { enviando: boolean; error: { texto: string; reintentable: boolean } | null };
export const useEstadoEnvio = create<EstadoEnvio>(() => ({ enviando: false, error: null }));

export function useEnviarPedido() {
  const { mesa, cerrarCuenta, refrescarCuenta, tokenQr } = useMesa();
  const t = useTextos();
  const qc = useQueryClient();
  const navegar = useNavigate();

  return async () => {
    if (!mesa || useEstadoEnvio.getState().enviando) return;
    const { lineas } = useCarrito.getState();
    if (!envioPendiente(mesa.cuentaId) && lineas.length === 0) return;
    const envio = prepararEnvio(mesa.cuentaId, lineas);
    useEstadoEnvio.setState({ enviando: true, error: null });
    try {
      await enviarConReintentos(envio, (pedido) => api.enviarPedido(mesa.token, pedido));
      olvidarEnvio(mesa.cuentaId);
      useCarrito.getState().quitarEnviadas(envio.lineas);
      useEstadoEnvio.setState({ enviando: false });
      refrescarCuenta();
      avisar(t.enviado);
      navegar(`/m/${tokenQr}/cuenta`, { replace: true });
    } catch (e) {
      const err = e as api.ErrorApi;
      if (esReintentable(err)) {
        // Queda guardado: el próximo intento (botón o al recargar) usa el mismo clientRequestId.
        useEstadoEnvio.setState({
          enviando: false,
          error: { texto: t.errorRed, reintentable: true },
        });
        return;
      }
      olvidarEnvio(mesa.cuentaId); // rechazado por el servidor: el próximo envío lleva otro id
      useEstadoEnvio.setState({
        enviando: false,
        error: { texto: t.errorEnvio(err.message), reintentable: false },
      });
      if (err.status === 410) cerrarCuenta();
      if (err.code === 'PLATO_NO_DISPONIBLE')
        qc.invalidateQueries({ queryKey: claves.menu(mesa.slug) });
    }
  };
}

export function useLlamadas() {
  const { mesa, cuenta, cerrarCuenta, refrescarCuenta } = useMesa();
  const t = useTextos();
  const manejar = (e: unknown) => {
    const err = e as api.ErrorApi;
    if (err.status === 410) cerrarCuenta();
    else avisar(err.status === 409 ? t.cuentaPedida : err.message);
  };
  return {
    cuentaPedida: cuenta?.estado === 'PIDIO_CUENTA',
    llamar: async () => {
      if (!mesa || !confirm(t.confirmarLlamar)) return;
      await api.llamarMesero(mesa.token).then(() => avisar(t.meseroViene), manejar);
    },
    pedirCuenta: async () => {
      if (!mesa || !confirm(t.confirmarCuenta)) return;
      await api.pedirCuenta(mesa.token).then(() => {
        avisar(t.cuentaSolicitada);
        refrescarCuenta();
      }, manejar);
    },
  };
}
