import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GrupoPublico, PlatoPublico } from '@menu-qr/shared';
import { grupoCompleto, minimoEfectivo, precioConModificadores } from '@menu-qr/shared/seleccion';
import { useUi } from './contexto';
import { nombreEn } from './util';
import { FotoPlato } from './menu';

// Lo que la hoja de detalle entrega al agregar (cada app arma su carrito con esto).
export type NuevaLinea = {
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

// Botón − / + con área táctil de 44px y aspecto del prototipo (32px).
export function QuantityStepper({
  valor,
  onCambio,
  min = 1,
  max = 20,
}: {
  valor: number;
  onCambio: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const { t } = useUi();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t.cantidad}>
      <button
        type="button"
        onClick={() => onCambio(valor - 1)}
        disabled={valor <= min}
        aria-label={t.menos}
        className="grid size-11 place-items-center disabled:opacity-40"
      >
        <span className="grid size-8 place-items-center rounded-[9px] bg-line text-muted">
          <Minus className="size-4" strokeWidth={1.9} aria-hidden />
        </span>
      </button>
      <span className="min-w-[14px] text-center font-medium tabular-nums" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        onClick={() => onCambio(valor + 1)}
        disabled={valor >= max}
        aria-label={t.mas}
        className="grid size-11 place-items-center disabled:opacity-40"
      >
        <span className="grid size-8 place-items-center rounded-[9px] bg-purple text-on-accent">
          <Plus className="size-4" strokeWidth={1.9} aria-hidden />
        </span>
      </button>
    </div>
  );
}

// Un solo valor obligatorio → radio. Si no → checkboxes; al pasar del máximo se suelta el más viejo.
export const esRadio = (g: GrupoPublico) => g.maximo === 1 && minimoEfectivo(g) >= 1;
export function alternarOpcion(g: GrupoPublico, elegidos: string[], id: string, marcado: boolean) {
  const delGrupo = new Set(g.modificadores.map((m) => m.id));
  const otros = elegidos.filter((x) => !delGrupo.has(x));
  let propios = elegidos.filter((x) => delGrupo.has(x));
  if (esRadio(g)) propios = [id];
  else if (marcado) propios = [...propios.filter((x) => x !== id), id].slice(-g.maximo);
  else propios = propios.filter((x) => x !== id);
  return [...otros, ...propios];
}

export function ModifierGroup({
  grupo: g,
  elegidos,
  error,
  precio,
  onCambio,
  refGrupo,
}: {
  grupo: GrupoPublico;
  elegidos: string[];
  error: boolean;
  precio: (c: number) => string;
  onCambio: (elegidos: string[]) => void;
  refGrupo: (el: HTMLDivElement | null) => void;
}) {
  const { t } = useUi();
  const { idioma } = useUi();
  const min = minimoEfectivo(g);
  const idError = `err-${g.id}`;
  return (
    <div
      ref={refGrupo}
      role="group"
      aria-labelledby={`g-${g.id}`}
      aria-describedby={error ? idError : undefined}
      className="mt-[18px] flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <strong id={`g-${g.id}`} className="text-[14.5px]">
          {nombreEn(g, idioma)}
        </strong>
        <span
          className={`rounded-md px-2 py-[3px] text-[11px] font-semibold tracking-[0.04em] uppercase ${min > 0 ? 'bg-amber-soft text-amber-ink' : 'bg-surface-2 text-muted'}`}
        >
          {min > 0 ? t.obligatorio : t.opcional}
        </span>
      </div>
      {g.modificadores.map((m) => (
        <label
          key={m.id}
          className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl bg-surface px-3.5 py-3 text-sm"
        >
          <input
            type={esRadio(g) ? 'radio' : 'checkbox'}
            name={`g-${g.id}`}
            checked={elegidos.includes(m.id)}
            onChange={(e) => onCambio(alternarOpcion(g, elegidos, m.id, e.target.checked))}
            className="size-[18px] accent-purple"
          />
          <span>{nombreEn(m, idioma)}</span>
          {m.precioExtra > 0 && (
            <span className="ml-auto text-[13px] text-muted tabular-nums">
              +{precio(m.precioExtra)}
            </span>
          )}
        </label>
      ))}
      <p id={idError} className="min-h-[1em] text-[12.5px] text-danger" aria-live="polite">
        {error ? (min === 1 && g.maximo === 1 ? t.elijaUna : t.elijaEntre(min, g.maximo)) : ''}
      </p>
    </div>
  );
}

// Modal accesible: foco atrapado, Escape y clic fuera cierran, el foco vuelve al botón que lo abrió.
export function Modal({
  etiqueta,
  onCerrar,
  children,
}: {
  etiqueta: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  // Solo al montar: si se re-ejecutara en cada render, el foco saltaría al primer elemento.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const caja = ref.current!;
    const focuseables = () =>
      [
        ...caja.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute('disabled'));
    focuseables()[0]?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
      if (e.key !== 'Tab') return;
      const els = focuseables();
      const primero = els[0];
      const ultimo = els.at(-1);
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo?.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero?.focus();
      }
    };
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
      previo?.focus();
    };
  }, []);
  return (
    <div
      className="anim-aparecer fixed inset-0 z-30 flex items-end justify-center bg-scrim sm:items-center sm:p-6"
      onClick={onCerrar}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        onClick={(e) => e.stopPropagation()}
        className="anim-subir max-h-[92dvh] w-full max-w-[420px] overflow-auto rounded-t-[26px] bg-app sm:max-h-[90dvh] sm:max-w-[560px] sm:rounded-[26px] px-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        {children}
      </div>
    </div>
  );
}

export function DishSheet({
  plato: p,
  icono,
  precio,
  puedePedir,
  onAgregar,
  onCerrar,
}: {
  plato: PlatoPublico;
  icono: string | null;
  precio: (c: number) => string;
  puedePedir: boolean;
  onAgregar: (l: NuevaLinea) => void;
  onCerrar: () => void;
}) {
  const { t } = useUi();
  const { idioma } = useUi();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [conError, setConError] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const unidad = precioConModificadores(p.precio, p.grupos, elegidos);
  const descripcion = idioma === 'en' ? p.descripcionEn : p.descripcionEs;

  const agregar = () => {
    // Si falta un grupo obligatorio: mensaje bajo ese grupo, desplazarse hasta él y no agregar.
    const incompleto = p.grupos.find((g) => !grupoCompleto(g, elegidos));
    if (incompleto) {
      setConError(incompleto.id);
      const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
      refs.current
        .get(incompleto.id)
        ?.scrollIntoView({ block: 'center', behavior: reducido ? 'auto' : 'smooth' });
      return;
    }
    const mods = p.grupos.flatMap((g) => g.modificadores).filter((m) => elegidos.includes(m.id));
    onAgregar({
      platoId: p.id,
      nombreEs: p.nombreEs,
      nombreEn: p.nombreEn,
      icono,
      fotoUrl: p.fotoMiniUrl ?? p.fotoUrl, // el carrito usa la foto chica
      cantidad,
      nota: nota.trim(),
      modificadores: elegidos,
      modsEs: mods.map((m) => m.nombreEs),
      modsEn: mods.map((m) => m.nombreEn),
      precioUnitario: unidad,
    });
  };

  return (
    <Modal etiqueta={nombreEn(p, idioma)} onCerrar={onCerrar}>
      <div className="relative -mx-5 h-[190px] overflow-hidden bg-surface-2 sm:h-[260px]">
        <FotoPlato fotoUrl={p.fotoUrl} icono={icono} tam={190} clase="h-full w-full text-[96px]" />
        <button
          type="button"
          onClick={onCerrar}
          aria-label={t.cerrar}
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-app"
        >
          <X className="size-4" strokeWidth={1.9} aria-hidden />
        </button>
      </div>
      <h2 className="mt-[18px] mb-1.5 text-[21px] font-semibold">{nombreEn(p, idioma)}</h2>
      {descripcion && <p className="text-[13.5px] leading-[1.55] text-muted">{descripcion}</p>}

      {p.grupos.map((g) => (
        <ModifierGroup
          key={g.id}
          grupo={g}
          elegidos={elegidos}
          error={conError === g.id && !grupoCompleto(g, elegidos)}
          precio={precio}
          onCambio={setElegidos}
          refGrupo={(el) => {
            if (el) refs.current.set(g.id, el);
          }}
        />
      ))}

      <div className="mt-[18px] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="nota-plato" className="text-[14.5px] font-semibold">
            {t.nota}
          </label>
          <span className="rounded-md bg-surface-2 px-2 py-[3px] text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
            {t.opcional}
          </span>
        </div>
        <textarea
          id="nota-plato"
          value={nota}
          maxLength={200}
          onChange={(e) => setNota(e.target.value)}
          placeholder={t.notaEjemplo}
          className="min-h-[72px] w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm text-fg placeholder:text-muted"
        />
      </div>

      <div className="mt-[18px] flex items-center gap-3">
        <QuantityStepper valor={cantidad} onCambio={setCantidad} />
        <button
          type="button"
          onClick={agregar}
          disabled={!puedePedir || p.agotado}
          className="flex h-14 flex-1 items-center justify-center gap-2.5 rounded-md bg-purple text-[15.5px] font-semibold text-on-accent disabled:opacity-60"
        >
          {p.agotado
            ? t.agotado
            : puedePedir
              ? `${t.agregar} · ${precio(unidad * cantidad)}`
              : t.cerrado}
        </button>
      </div>
      {!puedePedir && (
        <p
          role="status"
          className="mt-3 rounded-md bg-danger-soft px-4 py-3 text-[13px] text-danger"
        >
          {t.cerradoBanner}
        </p>
      )}
    </Modal>
  );
}
