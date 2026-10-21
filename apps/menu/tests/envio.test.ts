import { describe, expect, it, vi } from 'vitest';
import type { CrearPedidoInput, PedidoDetalle } from '@menu-qr/shared';
import { ErrorApi } from '../src/api';
import {
  enviarConReintentos,
  envioPendiente,
  olvidarEnvio,
  prepararEnvio,
} from '../src/datos/envio';
import { fusionar } from '../src/estado/carrito';

const lineas = fusionar([], {
  platoId: 'casado',
  nombreEs: 'Casado',
  nombreEn: 'Casado',
  icono: null,
  fotoUrl: null,
  cantidad: 1,
  nota: 'sin cebolla',
  modificadores: ['medio'],
  modsEs: [],
  modsEn: [],
  precioUnitario: 480000,
});
const sinEsperar = { esperar: async () => {} };
const pedidoOk = { id: 'p1' } as PedidoDetalle;

describe('reintento con el mismo clientRequestId', () => {
  it('si falla la red, reintenta con el MISMO clientRequestId hasta que entra', async () => {
    const envio = prepararEnvio('cuenta-1', lineas);
    const enviar = vi
      .fn<(p: CrearPedidoInput) => Promise<PedidoDetalle>>()
      .mockRejectedValueOnce(new ErrorApi(0, 'RED', 'Sin conexión'))
      .mockRejectedValueOnce(new ErrorApi(503, 'ERROR', 'No disponible'))
      .mockResolvedValueOnce(pedidoOk);

    await expect(enviarConReintentos(envio, enviar, sinEsperar)).resolves.toBe(pedidoOk);
    expect(enviar).toHaveBeenCalledTimes(3);
    const ids = enviar.mock.calls.map(([p]) => p.clientRequestId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(envio.clientRequestId);
  });

  it('el envío queda guardado: tras recargar la página se reutiliza el mismo id', () => {
    const primero = prepararEnvio('cuenta-2', lineas);
    const otraVez = prepararEnvio('cuenta-2', []); // p. ej. después de recargar
    expect(otraVez.clientRequestId).toBe(primero.clientRequestId);
    expect(envioPendiente('cuenta-2')?.pedido.items[0]).toMatchObject({
      platoId: 'casado',
      notas: 'sin cebolla',
    });
    olvidarEnvio('cuenta-2');
    expect(prepararEnvio('cuenta-2', lineas).clientRequestId).not.toBe(primero.clientRequestId);
  });

  it('un rechazo del servidor (409, 400) no se reintenta', async () => {
    const envio = prepararEnvio('cuenta-3', lineas);
    const enviar = vi.fn().mockRejectedValue(new ErrorApi(409, 'PLATO_NO_DISPONIBLE', 'Agotado'));
    await expect(enviarConReintentos(envio, enviar, sinEsperar)).rejects.toMatchObject({
      status: 409,
    });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('después de varios intentos fallidos se rinde (el envío sigue guardado)', async () => {
    const envio = prepararEnvio('cuenta-4', lineas);
    const enviar = vi.fn().mockRejectedValue(new ErrorApi(0, 'RED', 'Sin conexión'));
    await expect(
      enviarConReintentos(envio, enviar, { ...sinEsperar, intentos: 4 }),
    ).rejects.toMatchObject({ status: 0 });
    expect(enviar).toHaveBeenCalledTimes(4);
    expect(envioPendiente('cuenta-4')?.clientRequestId).toBe(envio.clientRequestId);
  });

  it('funciona aunque localStorage no esté disponible', () => {
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => prepararEnvio('cuenta-5', lineas)).not.toThrow();
    espia.mockRestore();
  });
});
