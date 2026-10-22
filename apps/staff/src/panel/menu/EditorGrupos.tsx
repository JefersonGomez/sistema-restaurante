import { Plus, Trash2 } from 'lucide-react';
import { Boton, Campo, Interruptor, Tarjeta } from '../comunes';

export type OpcionForm = {
  id?: string;
  clave: string;
  nombreEs: string;
  nombreEn: string;
  precioExtra: string;
};
export type GrupoForm = {
  id?: string;
  clave: string;
  nombreEs: string;
  nombreEn: string;
  obligatorio: boolean;
  minimo: number;
  maximo: number;
  modificadores: OpcionForm[];
};

let contador = 0;
export const nuevaClave = () => `n${++contador}`;
export const opcionVacia = (): OpcionForm => ({
  clave: nuevaClave(),
  nombreEs: '',
  nombreEn: '',
  precioExtra: '',
});
export const grupoVacio = (): GrupoForm => ({
  clave: nuevaClave(),
  nombreEs: '',
  nombreEn: '',
  obligatorio: true,
  minimo: 1,
  maximo: 1,
  modificadores: [opcionVacia()],
});

// Editor de grupos de modificadores (obligatorio, mínimo, máximo y opciones con precio extra).
// `errores` usa claves como "grupos.0.minimo" o "grupos.0.modificadores.1.nombreEn".
export function EditorGrupos({
  grupos,
  onCambio,
  errores,
}: {
  grupos: GrupoForm[];
  onCambio: (g: GrupoForm[]) => void;
  errores: Record<string, string>;
}) {
  const cambiarGrupo = (i: number, cambio: Partial<GrupoForm>) =>
    onCambio(grupos.map((g, j) => (j === i ? { ...g, ...cambio } : g)));
  const cambiarOpcion = (i: number, k: number, cambio: Partial<OpcionForm>) =>
    cambiarGrupo(i, {
      modificadores: grupos[i]!.modificadores.map((o, j) => (j === k ? { ...o, ...cambio } : o)),
    });

  return (
    <div className="space-y-3">
      {grupos.map((g, i) => (
        <Tarjeta key={g.clave} className="space-y-3 border border-line">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">Grupo {i + 1}</p>
            <button
              type="button"
              aria-label={`Quitar grupo ${g.nombreEs || i + 1}`}
              onClick={() => onCambio(grupos.filter((_, j) => j !== i))}
              className="grid size-11 place-items-center rounded-md text-danger hover:bg-surface"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Nombre (español)"
              placeholder="Término de la carne"
              value={g.nombreEs}
              onChange={(e) => cambiarGrupo(i, { nombreEs: e.target.value })}
              error={errores[`grupos.${i}.nombreEs`]}
            />
            <Campo
              etiqueta="Nombre (inglés)"
              placeholder="Doneness"
              value={g.nombreEn}
              onChange={(e) => cambiarGrupo(i, { nombreEn: e.target.value })}
              error={errores[`grupos.${i}.nombreEn`]}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1 text-sm">
              <Interruptor
                activo={g.obligatorio}
                etiqueta="Obligatorio"
                onCambio={(obligatorio) =>
                  cambiarGrupo(i, {
                    obligatorio,
                    minimo: obligatorio ? Math.max(1, g.minimo) : g.minimo,
                  })
                }
              />
              <span className="font-medium">{g.obligatorio ? 'Obligatorio' : 'Opcional'}</span>
            </div>
            <Campo
              etiqueta="Mínimo"
              type="number"
              min={0}
              max={50}
              className="w-28"
              value={g.minimo}
              onChange={(e) => cambiarGrupo(i, { minimo: Number(e.target.value) })}
              error={errores[`grupos.${i}.minimo`]}
            />
            <Campo
              etiqueta="Máximo"
              type="number"
              min={1}
              max={50}
              className="w-28"
              value={g.maximo}
              onChange={(e) => cambiarGrupo(i, { maximo: Number(e.target.value) })}
              error={errores[`grupos.${i}.maximo`]}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Opciones</legend>
            {errores[`grupos.${i}.modificadores`] && (
              <p className="text-xs text-danger">{errores[`grupos.${i}.modificadores`]}</p>
            )}
            {g.modificadores.map((o, k) => (
              <div
                key={o.clave}
                className="grid grid-cols-[1fr_1fr_110px_44px] items-start gap-2 max-sm:grid-cols-2"
              >
                <Campo
                  etiqueta="Español"
                  value={o.nombreEs}
                  onChange={(e) => cambiarOpcion(i, k, { nombreEs: e.target.value })}
                  error={errores[`grupos.${i}.modificadores.${k}.nombreEs`]}
                />
                <Campo
                  etiqueta="Inglés"
                  value={o.nombreEn}
                  onChange={(e) => cambiarOpcion(i, k, { nombreEn: e.target.value })}
                  error={errores[`grupos.${i}.modificadores.${k}.nombreEn`]}
                />
                <Campo
                  etiqueta="Extra ₡"
                  inputMode="decimal"
                  placeholder="0"
                  value={o.precioExtra}
                  onChange={(e) => cambiarOpcion(i, k, { precioExtra: e.target.value })}
                  error={errores[`grupos.${i}.modificadores.${k}.precioExtra`]}
                />
                <button
                  type="button"
                  aria-label={`Quitar opción ${o.nombreEs || k + 1}`}
                  onClick={() =>
                    cambiarGrupo(i, { modificadores: g.modificadores.filter((_, j) => j !== k) })
                  }
                  className="mt-6 grid size-11 place-items-center rounded-md text-danger hover:bg-surface"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <Boton
              variante="suave"
              onClick={() =>
                cambiarGrupo(i, { modificadores: [...g.modificadores, opcionVacia()] })
              }
            >
              <Plus className="size-4" aria-hidden /> Opción
            </Boton>
          </fieldset>
        </Tarjeta>
      ))}
      <Boton variante="suave" onClick={() => onCambio([...grupos, grupoVacio()])}>
        <Plus className="size-4" aria-hidden /> Agregar grupo de opciones
      </Boton>
    </div>
  );
}
