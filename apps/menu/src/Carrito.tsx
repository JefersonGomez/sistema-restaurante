import type { ConfigImpuestos, Idioma } from '@menu-qr/shared';
import { calcularTotales } from '@menu-qr/shared/totales';
import type { LineaCarrito } from './FichaPlato';
import { TEXTOS } from './i18n';

type Props = {
  lineas: LineaCarrito[];
  lang: Idioma;
  config: ConfigImpuestos;
  precio: (c: number) => string;
  enviando: boolean;
  error: string | null;
  onCantidad: (id: string, cantidad: number) => void;
  onEnviar: () => void;
  onCerrar: () => void;
};

export function Carrito({
  lineas,
  lang,
  config,
  precio,
  enviando,
  error,
  onCantidad,
  onEnviar,
  onCerrar,
}: Props) {
  const t = TEXTOS[lang];
  const estimado = calcularTotales(lineas, config);
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="carrito-titulo"
      onClick={onCerrar}
    >
      <div
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="carrito-titulo" className="text-lg font-semibold">
            {t.carrito}
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

        {lineas.length === 0 ? (
          <p className="py-6 text-center text-stone-500">{t.carritoVacio}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {lineas.map((l) => (
              <li key={l.id} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{lang === 'en' ? l.nombreEn : l.nombreEs}</p>
                  {l.modsEs.length > 0 && (
                    <p className="text-sm text-stone-500">
                      {(lang === 'en' ? l.modsEn : l.modsEs).join(' · ')}
                    </p>
                  )}
                  {l.notas && <p className="text-sm text-amber-800">“{l.notas}”</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onCantidad(l.id, l.cantidad - 1)}
                      className="h-8 w-8 rounded-full border border-stone-300"
                      aria-label={l.cantidad === 1 ? t.quitar : '−1'}
                    >
                      {l.cantidad === 1 ? '🗑' : '−'}
                    </button>
                    <span className="w-6 text-center tabular-nums">{l.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => onCantidad(l.id, Math.min(20, l.cantidad + 1))}
                      className="h-8 w-8 rounded-full border border-stone-300"
                      aria-label="+1"
                    >
                      +
                    </button>
                  </div>
                </div>
                <span className="shrink-0 font-medium tabular-nums">
                  {precio(l.precioUnitario * l.cantidad)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {lineas.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-stone-200 pt-3">
            <div className="flex justify-between font-semibold">
              <span>{t.totalEstimado}</span>
              <span className="tabular-nums">{precio(estimado.total)}</span>
            </div>
            <p className="text-xs text-stone-500">{t.totalNota}</p>
            {error && (
              <p role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={onEnviar}
              disabled={enviando}
              className="h-12 w-full rounded-full bg-[var(--color-marca)] font-semibold text-white disabled:opacity-60"
            >
              {enviando ? t.enviando : t.enviar}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
