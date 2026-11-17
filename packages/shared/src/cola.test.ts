import { describe, expect, it } from 'vitest';
import { describirAccion, esEncolable, vaciarCola, type AccionEnCola } from './cola';

const ID = '3f2a6b1c-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
const accion = (n: number): AccionEnCola => ({
  id: String(n),
  method: 'POST',
  ruta: `/operacion/pedidos/${ID}/avanzar`,
  texto: `acción ${n}`,
  creada: n,
});

describe('cola sin conexión', () => {
  it('solo guarda acciones de cocina y mesero seguras de repetir', () => {
    expect(esEncolable('POST', `/operacion/pedidos/${ID}/avanzar`)).toBe(true);
    expect(esEncolable('post', `/operacion/mesas/${ID}/pedidos`)).toBe(true);
    expect(esEncolable('PATCH', `/operacion/llamadas/${ID}/atender`)).toBe(true);
    // Cobrar, caja, en línea y lo que no calza exacto: necesitan conexión.
    expect(esEncolable('POST', `/operacion/cuentas/${ID}/cerrar`)).toBe(false);
    expect(esEncolable('POST', '/caja/turno/cerrar')).toBe(false);
    expect(esEncolable('POST', `/enlinea/${ID}/entregar`)).toBe(false);
    expect(esEncolable('GET', `/operacion/pedidos/${ID}/avanzar`)).toBe(false);
    expect(esEncolable('POST', `/operacion/pedidos/${ID}/avanzar/otra`)).toBe(false);
    expect(describirAccion('PATCH', `/operacion/llamadas/${ID}/atender`)).toBe('Atender llamada');
  });

  it('envía en orden, se detiene sin red y descarta las rechazadas', async () => {
    const enviadas: string[] = [];
    const respuestas: Record<string, 'ok' | 'sin-red' | 'rechazada'> = {
      '1': 'ok',
      '2': 'rechazada',
      '3': 'ok',
      '4': 'sin-red',
      '5': 'ok',
    };
    const r = await vaciarCola([1, 2, 3, 4, 5].map(accion), async (a) => {
      enviadas.push(a.id);
      return respuestas[a.id]!;
    });
    expect(enviadas).toEqual(['1', '2', '3', '4']); // la 5 no se intenta: sigue sin red
    expect(r.descartadas.map((a) => a.id)).toEqual(['2']);
    expect(r.pendientes.map((a) => a.id)).toEqual(['4', '5']);
  });
});
