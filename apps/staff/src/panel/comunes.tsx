import { AlertTriangle, Inbox } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

// Piezas básicas del panel con los tokens de packages/ui (nunca colores fijos).

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg bg-app p-4 shadow-tarjeta ${className}`}>{children}</section>
  );
}

export function TituloPagina({
  titulo,
  detalle,
  acciones,
}: {
  titulo: string;
  detalle?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{titulo}</h1>
        {detalle && <p className="mt-1 text-sm text-muted">{detalle}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

type Variante = 'principal' | 'suave' | 'peligro' | 'amber';
const VARIANTES: Record<Variante, string> = {
  principal: 'bg-purple text-on-accent',
  suave: 'bg-surface text-fg hover:bg-surface-2',
  peligro: 'bg-danger text-on-accent',
  amber: 'bg-amber text-on-amber',
};

export function Boton({
  variante = 'principal',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
    />
  );
}

// Interruptor accesible (role="switch").
export function Interruptor({
  activo,
  onCambio,
  etiqueta,
  disabled,
}: {
  activo: boolean;
  onCambio: (v: boolean) => void;
  etiqueta: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambio(!activo)}
      className="grid min-h-11 min-w-11 place-items-center disabled:opacity-50"
    >
      <span
        className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${activo ? 'bg-purple' : 'bg-line'}`}
      >
        <span
          className={`size-5 rounded-full bg-app shadow transition-transform ${activo ? 'translate-x-5' : ''}`}
        />
      </span>
    </button>
  );
}

// Campo con etiqueta y error junto al campo.
export function Campo({
  etiqueta,
  error,
  ayuda,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string; ayuda?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`block text-sm ${className}`}>
      <span className="font-medium">{etiqueta}</span>
      <input
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={error || ayuda ? `${id}-msg` : undefined}
        {...props}
        className={`mt-1 h-11 w-full rounded-xl border bg-surface px-3 text-fg placeholder:text-muted ${error ? 'border-danger' : 'border-line'}`}
      />
      {(error || ayuda) && (
        <span
          id={`${id}-msg`}
          className={`mt-1 block text-xs ${error ? 'text-danger' : 'text-muted'}`}
        >
          {error ?? ayuda}
        </span>
      )}
    </label>
  );
}

export function Esqueleto({ className }: { className: string }) {
  return <div aria-hidden className={`esqueleto rounded-md ${className}`} />;
}

export function EstadoVacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line p-8 text-center">
      <Inbox className="size-8 text-muted" aria-hidden />
      <p className="font-semibold">{titulo}</p>
      <p className="max-w-sm text-sm text-muted">{detalle}</p>
      {accion}
    </div>
  );
}

// Error que dice cómo resolverlo, con reintento.
export function ErrorCarga({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md bg-danger-soft p-4 text-sm text-danger"
    >
      <AlertTriangle className="size-5 shrink-0" aria-hidden />
      <span className="flex-1">{mensaje}. Revise la conexión y vuelva a intentar.</span>
      <Boton variante="suave" onClick={onReintentar}>
        Reintentar
      </Boton>
    </div>
  );
}

// Pastilla de estado con los colores de la identidad: amarillo atención, verde ok, rojo problema.
export function Etiqueta({
  tono,
  children,
}: {
  tono: 'amber' | 'ok' | 'danger' | 'purple' | 'neutro';
  children: ReactNode;
}) {
  const t = {
    amber: 'bg-amber-soft text-amber-ink',
    ok: 'bg-ok-soft text-ok',
    danger: 'bg-danger-soft text-danger',
    purple: 'bg-purple-soft text-purple',
    neutro: 'bg-surface-2 text-muted',
  }[tono];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}
    >
      {children}
    </span>
  );
}
