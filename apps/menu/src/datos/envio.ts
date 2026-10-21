import type { CrearPedidoInput, PedidoDetalle } from '@menu-qr/shared';
import { guardar, leer, nuevoId } from '../almacen';
import { ErrorApi } from '../api';
import type { LineaCarrito } from '../estado/carrito';

// `lineas`: lo que se envió, para quitarlo del carrito al confirmarse.
export type Envio = { clientRequestId: string; pedido: CrearPedidoInput; lineas: LineaCarrito[] };

const clave = (cuentaId: string) => `envio:${cuentaId}`;
export const envioPendiente = (cuentaId: string) => leer<Envio>(clave(cuentaId));

// Arma el envío una sola vez y lo guarda ANTES de mandarlo: si se cae la red o se recarga la
// página, el reintento usa el mismo clientRequestId y el servidor no duplica el pedido.
export function prepararEnvio(cuentaId: string, lineas: LineaCarrito[]): Envio {
  const previo = envioPendiente(cuentaId);
  if (previo) return previo;
  const clientRequestId = nuevoId();
  const envio: Envio = {
    clientRequestId,
    lineas,
    pedido: {
      clientRequestId,
      items: lineas.map((l) => ({
        platoId: l.platoId,
        cantidad: l.cantidad,
        notas: l.nota || undefined,
        modificadores: l.modificadores,
      })),
    },
  };
  guardar(clave(cuentaId), envio);
  return envio;
}

export const olvidarEnvio = (cuentaId: string) => guardar(clave(cuentaId), null);

// Errores de red, del servidor o de rate limit se pueden reintentar con el mismo id.
export const esReintentable = (e: unknown) =>
  e instanceof ErrorApi && (e.status === 0 || e.status >= 500 || e.status === 429);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reintenta con espera creciente (1 s, 2 s, 4 s) reutilizando SIEMPRE el mismo envío.
export async function enviarConReintentos(
  envio: Envio,
  enviar: (pedido: CrearPedidoInput) => Promise<PedidoDetalle>,
  {
    intentos = 4,
    esperar = dormir,
  }: { intentos?: number; esperar?: (ms: number) => Promise<unknown> } = {},
) {
  for (let i = 0; ; i++) {
    try {
      return await enviar(envio.pedido);
    } catch (e) {
      if (!esReintentable(e) || i >= intentos - 1) throw e;
      await esperar(1000 * 2 ** i);
    }
  }
}
