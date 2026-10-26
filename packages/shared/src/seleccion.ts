// Reglas de selección de modificadores (mismas en API y frontends).

export type GrupoSeleccion = {
  id: string;
  obligatorio: boolean;
  minimo: number;
  maximo: number;
  modificadores: { id: string; precioExtra: number }[];
};

// Un grupo obligatorio exige al menos 1 aunque su mínimo diga 0.
export const minimoEfectivo = (g: { obligatorio: boolean; minimo: number }) =>
  g.obligatorio ? Math.max(1, g.minimo) : g.minimo;

export const grupoCompleto = (g: GrupoSeleccion, elegidos: string[]) => {
  const n = g.modificadores.filter((m) => elegidos.includes(m.id)).length;
  return n >= minimoEfectivo(g) && n <= g.maximo;
};

// Precio estimado de una unidad (el real lo calcula el servidor).
export const precioConModificadores = (
  precio: number,
  grupos: GrupoSeleccion[],
  elegidos: string[],
) =>
  precio +
  grupos
    .flatMap((g) => g.modificadores)
    .filter((m) => elegidos.includes(m.id))
    .reduce((s, m) => s + m.precioExtra, 0);
