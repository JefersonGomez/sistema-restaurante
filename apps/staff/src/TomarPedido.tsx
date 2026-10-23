import { Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MenuPublico, PlatoPublico } from '@menu-qr/shared';
import {
  CategoryGrid,
  DishCard,
  DishSheet,
  SearchBar,
  normalizar,
  type NuevaLinea,
} from '@menu-qr/ui';
import { api, ErrorApi, obtenerMenu } from './api';

type Linea = NuevaLinea & { clave: number };

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

// El mesero arma un pedido para una mesa con los mismos componentes del menú del comensal.
// Puede pedir aunque el restaurante figure cerrado (la API solo bloquea al cliente).
export function TomarPedido({ slug, mesa, precio, onListo, onCerrar }: Props) {
  const [menu, setMenu] = useState<MenuPublico>();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<PlatoPublico | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por envío: los reintentos lo reutilizan y la API no duplica el pedido.
  const [clientRequestId] = useState(nuevoId);

  useEffect(() => {
    obtenerMenu(slug, true).then(setMenu, (e: Error) => setError(e.message));
  }, [slug]);

  const iconoDe = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of menu?.categorias ?? []) for (const p of c.platos) m.set(p.id, c.icono);
    return m;
  }, [menu]);
  const q = normalizar(busqueda);
  const platos = (menu?.categorias ?? [])
    .filter((c) => !categoria || c.id === categoria)
    .flatMap((c) => c.platos)
    .filter((p) => !q || normalizar(`${p.nombreEs} ${p.nombreEn}`).includes(q));

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    const body = {
      clientRequestId,
      items: lineas.map((l) => ({
        platoId: l.platoId,
        cantidad: l.cantidad,
        notas: l.nota || undefined,
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

  const total = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-app"
      role="dialog"
      aria-modal="true"
      aria-label={`Pedido para la mesa ${mesa.numero}`}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-[17px] font-semibold">Pedido para la mesa {mesa.numero}</h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar sin enviar"
          className="grid size-11 place-items-center rounded-md hover:bg-surface"
        >
          <X className="size-5" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
          {!menu && !error && <div className="esqueleto h-60 rounded-lg" aria-busy="true" />}
          {menu && (
            <>
              <SearchBar valor={busqueda} onCambio={setBusqueda} />
              <CategoryGrid
                categorias={menu.categorias}
                activa={categoria}
                onElegir={setCategoria}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {platos.map((p) => (
                  <DishCard
                    key={p.id}
                    plato={p}
                    icono={iconoDe.get(p.id) ?? null}
                    precio={precio}
                    puedePedir
                    onAbrir={() => setEligiendo(p)}
                  />
                ))}
                {platos.length === 0 && (
                  <p className="col-span-full py-8 text-center text-muted">
                    No hay platos con ese nombre.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="border-t border-line bg-app p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl space-y-2">
          {lineas.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {lineas.map((l) => (
                <li key={l.clave} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Quitar ${l.nombreEs}`}
                    onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                    className="grid size-11 shrink-0 place-items-center rounded-md text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                  <span className="tabular-nums">{l.cantidad}×</span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.nombreEs}
                    {l.modsEs.length > 0 && (
                      <span className="text-muted"> · {l.modsEs.join(', ')}</span>
                    )}
                    {l.nota && <em className="text-amber-ink"> “{l.nota}”</em>}
                  </span>
                  <span className="tabular-nums">{precio(l.precioUnitario * l.cantidad)}</span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={enviar}
            disabled={!lineas.length || enviando}
            className="flex h-14 w-full items-center justify-center rounded-md bg-purple text-[15.5px] font-semibold text-on-accent disabled:opacity-50"
          >
            {enviando
              ? 'Enviando…'
              : lineas.length
                ? `Enviar a cocina · ${unidades} · ${precio(total)}`
                : 'Elija platos para el pedido'}
          </button>
        </div>
      </footer>

      {eligiendo && (
        <DishSheet
          plato={eligiendo}
          icono={iconoDe.get(eligiendo.id) ?? null}
          precio={precio}
          puedePedir
          onCerrar={() => setEligiendo(null)}
          onAgregar={(l) => {
            setLineas((ls) => [...ls, { ...l, clave: Date.now() }]);
            setEligiendo(null);
          }}
        />
      )}
    </div>
  );
}
