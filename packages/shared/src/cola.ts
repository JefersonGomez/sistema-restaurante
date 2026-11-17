// Cola de acciones sin conexión (Fase 18): solo acciones de cocina y mesero seguras de repetir.
// La lógica no depende del navegador: el panel la guarda en el equipo y le pasa cómo enviar.

export type AccionEnCola = {
  id: string;
  method: string;
  ruta: string;
  body?: unknown;
  texto: string; // qué fue, para avisar si no se pudo aplicar
  creada: number;
};

const UUID = '[0-9a-fA-F-]{36}';
const PERMITIDAS: [string, RegExp, string][] = [
  ['POST', new RegExp(`^/operacion/pedidos/${UUID}/avanzar$`), 'Cambio de estado en cocina'],
  ['POST', new RegExp(`^/operacion/pedidos/${UUID}/avisar-listo$`), 'Aviso al mesero'],
  ['POST', new RegExp(`^/operacion/items/${UUID}/deshacer$`), 'Deshacer en cocina'],
  // Lleva clientRequestId: si ya había llegado, la API no lo duplica.
  ['POST', new RegExp(`^/operacion/mesas/${UUID}/pedidos$`), 'Pedido tomado por el mesero'],
  ['PATCH', new RegExp(`^/operacion/pedidos/${UUID}/confirmar$`), 'Confirmar pedido'],
  ['PATCH', new RegExp(`^/operacion/items/${UUID}/estado$`), 'Marcar plato entregado'],
  ['PATCH', new RegExp(`^/operacion/llamadas/${UUID}/atender$`), 'Atender llamada'],
];
const regla = (method: string, ruta: string) =>
  PERMITIDAS.find(([m, r]) => m === method.toUpperCase() && r.test(ruta));

// ¿Se puede guardar para enviar después? Cobros, caja, en línea y ajustes necesitan conexión.
export const esEncolable = (method: string, ruta: string) => !!regla(method, ruta);
// Qué fue, en palabras, para avisar si no se pudo aplicar.
export const describirAccion = (method: string, ruta: string) => regla(method, ruta)?.[2] ?? ruta;

// Resultado de enviar una acción: ok, sin red (se reintenta luego) o rechazada (se descarta).
export type ResultadoEnvio = 'ok' | 'sin-red' | 'rechazada';

// Envía la cola en orden. Se detiene en la primera sin red (las demás esperan, sin cambiar el
// orden); las rechazadas por el servidor se descartan y se devuelven para avisar.
export async function vaciarCola(
  cola: AccionEnCola[],
  enviar: (a: AccionEnCola) => Promise<ResultadoEnvio>,
) {
  const descartadas: AccionEnCola[] = [];
  let i = 0;
  for (; i < cola.length; i++) {
    const r = await enviar(cola[i]!);
    if (r === 'sin-red') break;
    if (r === 'rechazada') descartadas.push(cola[i]!);
  }
  return { pendientes: cola.slice(i), descartadas };
}
