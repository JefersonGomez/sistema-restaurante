import { useState } from 'react';
import type { Idioma, PlatoPublico } from '@menu-qr/shared';
import {
  grupoCompleto,
  minimoEfectivo,
  precioConModificadores,
  seleccionValida,
} from '@menu-qr/shared/seleccion';
import { nombre, TEXTOS } from './i18n';

export type LineaCarrito = {
  id: string;
  platoId: string;
  nombreEs: string;
  nombreEn: string;
  cantidad: number;
  notas: string;
  modificadores: string[];
  modsEs: string[];
  modsEn: string[];
  precioUnitario: number; // estimado; el real lo calcula el servidor
};

type Props = {
  plato: PlatoPublico;
  lang: Idioma;
  precio: (c: number) => string;
  onAgregar: (l: Omit<LineaCarrito, 'id'>) => void;
  onCerrar: () => void;
};

export function FichaPlato({ plato: p, lang, precio, onAgregar, onCerrar }: Props) {
  const t = TEXTOS[lang];
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [notas, setNotas] = useState('');
  const [cantidad, setCantidad] = useState(1);

  const alternar = (grupoId: string, modId: string) => {
    const g = p.grupos.find((x) => x.id === grupoId)!;
    const delGrupo = g.modificadores.map((m) => m.id);
    setElegidos((actual) => {
      if (actual.includes(modId)) return actual.filter((x) => x !== modId);
      // Grupo de una sola opción: elegir reemplaza (como un radio).
      if (g.maximo === 1) return [...actual.filter((x) => !delGrupo.includes(x)), modId];
      const n = actual.filter((x) => delGrupo.includes(x)).length;
      return n >= g.maximo ? actual : [...actual, modId];
    });
  };

  const unidad = precioConModificadores(p.precio, p.grupos, elegidos);
  const valido = seleccionValida(p.grupos, elegidos) && !p.agotado;
  const descripcion = lang === 'en' ? p.descripcionEn : p.descripcionEs;
  const mods = p.grupos.flatMap((g) => g.modificadores).filter((m) => elegidos.includes(m.id));

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ficha-titulo"
      onClick={onCerrar}
    >
      <div
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {p.fotoUrl && <img src={p.fotoUrl} alt="" className="h-48 w-full object-cover" />}
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="ficha-titulo" className="text-lg font-semibold">
              {nombre(p, lang)}
            </h2>
            <button
              type="button"
              onClick={onCerrar}
              className="text-sm text-stone-500"
              aria-label={t.cerrar}
            >
              ✕
            </button>
          </div>
          {descripcion && <p className="text-sm text-stone-600">{descripcion}</p>}
          {p.alergenos.length > 0 && (
            <p className="text-xs text-stone-500">
              {t.alergenos}: {p.alergenos.join(', ')}
            </p>
          )}

          {p.grupos.map((g) => {
            const min = minimoEfectivo(g);
            const ok = grupoCompleto(g, elegidos);
            return (
              <fieldset key={g.id} className="rounded-lg border border-stone-200 p-3">
                <legend className="px-1 text-sm font-medium">
                  {nombre(g, lang)}{' '}
                  <span
                    className={`text-xs font-normal ${ok ? 'text-stone-500' : 'text-amber-700'}`}
                  >
                    {min > 0 ? `${t.obligatorio} · ` : ''}
                    {t.elegir(min, g.maximo)}
                  </span>
                </legend>
                {g.modificadores.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-3 py-1.5 text-sm"
                  >
                    <input
                      type={g.maximo === 1 && min >= 1 ? 'radio' : 'checkbox'}
                      name={g.id}
                      checked={elegidos.includes(m.id)}
                      onChange={() => alternar(g.id, m.id)}
                      className="h-5 w-5 accent-[var(--color-marca)]"
                    />
                    <span className="flex-1">{nombre(m, lang)}</span>
                    {m.precioExtra > 0 && (
                      <span className="text-stone-500">+{precio(m.precioExtra)}</span>
                    )}
                  </label>
                ))}
              </fieldset>
            );
          })}

          <label className="block text-sm">
            <span className="font-medium">{t.notas}</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value.slice(0, 200))}
              maxLength={200}
              rows={2}
              placeholder={t.notasEjemplo}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-stone-300">
              <button
                type="button"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                className="h-11 w-11 text-lg"
                aria-label="−1"
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums" aria-live="polite">
                {cantidad}
              </span>
              <button
                type="button"
                onClick={() => setCantidad((c) => Math.min(20, c + 1))}
                className="h-11 w-11 text-lg"
                aria-label="+1"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!valido}
              onClick={() =>
                onAgregar({
                  platoId: p.id,
                  nombreEs: p.nombreEs,
                  nombreEn: p.nombreEn,
                  cantidad,
                  notas: notas.trim(),
                  modificadores: elegidos,
                  modsEs: mods.map((m) => m.nombreEs),
                  modsEn: mods.map((m) => m.nombreEn),
                  precioUnitario: unidad,
                })
              }
              className="h-11 flex-1 rounded-full bg-[var(--color-marca)] font-medium text-white disabled:opacity-40"
            >
              {p.agotado ? t.agotado : t.agregar(precio(unidad * cantidad))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
