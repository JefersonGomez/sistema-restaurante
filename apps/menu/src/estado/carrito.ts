import { create } from 'zustand';
import { guardar, leer } from '../almacen';

export type LineaCarrito = {
  clave: string; // plato + modificadores + nota: dos líneas con la misma clave se fusionan
  platoId: string;
  nombreEs: string;
  nombreEn: string;
  icono: string | null;
  fotoUrl: string | null;
  cantidad: number;
  nota: string;
  modificadores: string[];
  modsEs: string[];
  modsEn: string[];
  precioUnitario: number; // estimado; el precio oficial lo calcula el servidor
};

export const CANTIDAD_MAX = 20;

export const claveLinea = (platoId: string, modificadores: string[], nota: string) =>
  JSON.stringify([platoId, [...modificadores].sort(), nota.trim()]);

// Agrega una línea; si ya hay una igual (mismo plato, modificadores y nota) suma la cantidad.
export function fusionar(
  lineas: LineaCarrito[],
  nueva: Omit<LineaCarrito, 'clave'>,
): LineaCarrito[] {
  const clave = claveLinea(nueva.platoId, nueva.modificadores, nueva.nota);
  const existente = lineas.find((l) => l.clave === clave);
  if (!existente) return [...lineas, { ...nueva, nota: nueva.nota.trim(), clave }];
  return lineas.map((l) =>
    l.clave === clave ? { ...l, cantidad: Math.min(CANTIDAD_MAX, l.cantidad + nueva.cantidad) } : l,
  );
}

// Cambiar la nota cambia la clave; si coincide con otra línea, se fusionan.
export function conNota(lineas: LineaCarrito[], clave: string, nota: string): LineaCarrito[] {
  const linea = lineas.find((l) => l.clave === clave);
  if (!linea) return lineas;
  return fusionar(
    lineas.filter((l) => l.clave !== clave),
    { ...linea, nota },
  );
}

// Quita del carrito lo que ya se envió (por clave y cantidad); lo agregado después se conserva.
export function restar(lineas: LineaCarrito[], enviadas: LineaCarrito[]): LineaCarrito[] {
  const enviado = new Map(enviadas.map((l) => [l.clave, l.cantidad]));
  return lineas
    .map((l) => ({ ...l, cantidad: l.cantidad - (enviado.get(l.clave) ?? 0) }))
    .filter((l) => l.cantidad > 0);
}

type Carrito = {
  cuentaId: string | null;
  lineas: LineaCarrito[];
  cargar: (cuentaId: string) => void;
  agregar: (l: Omit<LineaCarrito, 'clave'>) => void;
  cambiarCantidad: (clave: string, cantidad: number) => void;
  quitar: (clave: string) => void;
  cambiarNota: (clave: string, nota: string) => void;
  quitarEnviadas: (enviadas: LineaCarrito[]) => void;
  vaciar: () => void;
};

const claveAlmacen = (cuentaId: string) => `carrito:${cuentaId}`;

// El carrito se guarda por cuenta (localStorage dentro de try/catch, ver almacen.ts).
export const useCarrito = create<Carrito>((set, get) => {
  const fijar = (lineas: LineaCarrito[]) => {
    set({ lineas });
    const { cuentaId } = get();
    if (cuentaId) guardar(claveAlmacen(cuentaId), lineas);
  };
  return {
    cuentaId: null,
    lineas: [],
    cargar: (cuentaId) => {
      if (get().cuentaId !== cuentaId)
        set({ cuentaId, lineas: leer<LineaCarrito[]>(claveAlmacen(cuentaId)) ?? [] });
    },
    agregar: (l) => fijar(fusionar(get().lineas, l)),
    cambiarCantidad: (clave, cantidad) =>
      fijar(
        cantidad < 1
          ? get().lineas.filter((l) => l.clave !== clave)
          : get().lineas.map((l) =>
              l.clave === clave ? { ...l, cantidad: Math.min(CANTIDAD_MAX, cantidad) } : l,
            ),
      ),
    quitar: (clave) => fijar(get().lineas.filter((l) => l.clave !== clave)),
    cambiarNota: (clave, nota) => fijar(conNota(get().lineas, clave, nota)),
    quitarEnviadas: (enviadas) => fijar(restar(get().lineas, enviadas)),
    vaciar: () => fijar([]),
  };
});
