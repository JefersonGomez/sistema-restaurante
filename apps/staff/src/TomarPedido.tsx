import { useEffect, useState } from 'react';
import type { MenuPublico, PlatoPublico } from '@menu-qr/shared';
import {
  grupoCompleto,
  minimoEfectivo,
  precioConModificadores,
  seleccionValida,
} from '@menu-qr/shared/seleccion';
import { api, ErrorApi, obtenerMenu } from './api';

type Linea = {
  id: number;
  plato: PlatoPublico;
  cantidad: number;
  notas: string;
  modificadores: string[];
};

const nuevoId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = {
  slug: string;
  mesa: { id: string; numero: number };
  precio: (c: number) => string;
  onListo: () => void;
  onCerrar: () => void;
};

// El mesero arma un pedido para una mesa con el mismo catálogo del comensal.
export function TomarPedido({ slug, mesa, precio, onListo, onCerrar }: Props) {
  const [menu, setMenu] = useState<MenuPublico>();
  const [eligiendo, setEligiendo] = useState<PlatoPublico | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por envío: los reintentos lo reutilizan y la API no duplica el pedido.
  const [clientRequestId] = useState(nuevoId);

  useEffect(() => {
    obtenerMenu(slug, true).then(setMenu, (e: Error) => setError(e.message));
  }, [slug]);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    const body = {
      clientRequestId,
      items: lineas.map((l) => ({
        platoId: l.plato.id,
        cantidad: l.cantidad,
        notas: l.notas || undefined,
        modificadores: l.modificadores,
      })),
    };
    try {
      for (let intento = 0; ; intento++) {
        try {
          await api(`/operacion/mesas/${mesa.id}/pedidos`, { method: 'POST', body });
          return onListo();
        } catch (e) {
          const err = e as ErrorApi;
          if ((err.status === 0 || err.status >= 500) && intento < 3) {
            await esperar(1000 * 2 ** intento);
            continue;
          }
          return setError(err.message);
        }
      }
    } finally {
      setEnviando(false);
    }
  };

  const total = lineas.reduce(
    (s, l) =>
      s + precioConModificadores(l.plato.precio, l.plato.grupos, l.modificadores) * l.cantidad,
    0,
  );

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Pedido mesa ${mesa.numero}`}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">Pedido para mesa {mesa.numero}</h2>
        <button type="button" onClick={onCerrar} className="text-sm text-stone-500">
          Cerrar
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4">
        {!menu && !error && <p className="py-6 text-stone-500">Cargando menú…</p>}
        {menu?.categorias.map((c) => (
          <section key={c.id} className="pt-4">
            <h3 className="mb-1 text-sm font-semibold uppercase text-teal-800">{c.nombreEs}</h3>
            {c.platos.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.agotado}
                onClick={() =>
                  p.grupos.length
                    ? setEligiendo(p)
                    : setLineas((ls) => [
                        ...ls,
                        { id: Date.now(), plato: p, cantidad: 1, notas: '', modificadores: [] },
                      ])
                }
                className="flex w-full justify-between border-b border-stone-100 py-3 text-left disabled:opacity-40"
              >
                <span>
                  {p.nombreEs} {p.agotado && <em className="text-xs">(agotado)</em>}
                </span>
                <span className="tabular-nums text-stone-600">{precio(p.precio)}</span>
              </button>
            ))}
          </section>
        ))}
      </div>

      <footer className="space-y-2 border-t bg-stone-50 p-3">
        {lineas.map((l) => (
          <div key={l.id} className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
              aria-label="Quitar"
              className="text-red-700"
            >
              ✕
            </button>
            <span className="tabular-nums">{l.cantidad}×</span>
            <span className="flex-1 truncate">
              {l.plato.nombreEs}
              {l.notas && <em className="text-amber-800"> “{l.notas}”</em>}
            </span>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={lineas.length === 0 || enviando}
          onClick={enviar}
          className="h-12 w-full rounded-lg bg-teal-700 font-semibold text-white disabled:opacity-40"
        >
          {enviando ? 'Enviando…' : `Enviar a cocina · ${precio(total)}`}
        </button>
      </footer>

      {eligiendo && (
        <ElegirModificadores
          plato={eligiendo}
          precio={precio}
          onCerrar={() => setEligiendo(null)}
          onAgregar={(l) => {
            setLineas((ls) => [...ls, { ...l, id: Date.now(), plato: eligiendo }]);
            setEligiendo(null);
          }}
        />
      )}
    </div>
  );
}

function ElegirModificadores({
  plato,
  precio,
  onAgregar,
  onCerrar,
}: {
  plato: PlatoPublico;
  precio: (c: number) => string;
  onAgregar: (l: { cantidad: number; notas: string; modificadores: string[] }) => void;
  onCerrar: () => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState('');

  const alternar = (grupoIdx: number, id: string) => {
    const g = plato.grupos[grupoIdx]!;
    const delGrupo = g.modificadores.map((m) => m.id);
    setElegidos((a) =>
      a.includes(id)
        ? a.filter((x) => x !== id)
        : g.maximo === 1
          ? [...a.filter((x) => !delGrupo.includes(x)), id]
          : a.filter((x) => delGrupo.includes(x)).length >= g.maximo
            ? a
            : [...a, id],
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onCerrar}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-lg font-semibold">{plato.nombreEs}</h3>
        {plato.grupos.map((g, idx) => (
          <fieldset key={g.id} className="mb-3">
            <legend
              className={`text-sm font-medium ${grupoCompleto(g, elegidos) ? '' : 'text-amber-700'}`}
            >
              {g.nombreEs} ({minimoEfectivo(g)}–{g.maximo})
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {g.modificadores.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={elegidos.includes(m.id)}
                  onClick={() => alternar(idx, m.id)}
                  className={`rounded-full px-3 py-1.5 text-sm ${elegidos.includes(m.id) ? 'bg-teal-700 text-white' : 'border border-stone-300'}`}
                >
                  {m.nombreEs}
                  {m.precioExtra > 0 && ` +${precio(m.precioExtra)}`}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value.slice(0, 200))}
          placeholder="Notas (ej.: sin cebolla)"
          className="mb-3 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="rounded-md border px-2"
            aria-label="Cantidad"
          >
            {Array.from({ length: 20 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!seleccionValida(plato.grupos, elegidos)}
            onClick={() => onAgregar({ cantidad, notas: notas.trim(), modificadores: elegidos })}
            className="h-11 flex-1 rounded-lg bg-teal-700 font-medium text-white disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
