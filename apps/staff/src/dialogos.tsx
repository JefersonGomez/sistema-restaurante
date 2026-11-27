import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Ventanas propias de la app (Fase 20.3) en vez de las grises del navegador (confirm/prompt):
// se ven con el estilo de KitchaGo, sirven en el celular y los motivos se eligen con un toque.

export const MOTIVOS_CANCELAR = ['Se acabó', 'El cliente cambió de idea', 'Error al pedir'];

type Pregunta =
  | {
      tipo: 'confirmar';
      titulo: string;
      detalle?: string;
      boton: string;
      peligro: boolean;
      responder: (si: boolean) => void;
    }
  | {
      tipo: 'motivo';
      titulo: string;
      opciones: string[];
      responder: (motivo: string | null) => void;
    };

let actual: Pregunta | null = null;
const oyentes = new Set<() => void>();
const mostrar = (p: Pregunta | null) => {
  actual = p;
  oyentes.forEach((o) => o());
};

// "¿Seguro?" con un botón claro. Resuelve true si confirma.
export function confirmar(
  titulo: string,
  o: { detalle?: string; boton?: string; peligro?: boolean } = {},
) {
  return new Promise<boolean>((resolver) =>
    mostrar({
      tipo: 'confirmar',
      titulo,
      detalle: o.detalle,
      boton: o.boton ?? 'Sí, continuar',
      peligro: o.peligro ?? false,
      responder: (si) => {
        mostrar(null);
        resolver(si);
      },
    }),
  );
}

// Motivo de un toque (o escrito con "Otro…"). null si se cerró sin elegir.
export function pedirMotivo(titulo: string, opciones: string[] = MOTIVOS_CANCELAR) {
  return new Promise<string | null>((resolver) =>
    mostrar({
      tipo: 'motivo',
      titulo,
      opciones,
      responder: (m) => {
        mostrar(null);
        resolver(m ? m.trim().slice(0, 200) || null : null);
      },
    }),
  );
}

const boton =
  'inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-[15px] font-semibold';

export function Dialogos() {
  const p = useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => actual,
  );
  const [otro, setOtro] = useState<string | null>(null);
  const principal = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOtro(null);
    if (!p) return;
    principal.current?.focus();
    const tecla = (e: KeyboardEvent) =>
      e.key === 'Escape' && (p.tipo === 'confirmar' ? p.responder(false) : p.responder(null));
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [p]);
  if (!p) return null;
  const cerrar = () => (p.tipo === 'confirmar' ? p.responder(false) : p.responder(null));

  return (
    <div
      className="anim-aparecer fixed inset-0 z-50 flex items-end justify-center bg-scrim p-4 sm:items-center"
      onClick={cerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        onClick={(e) => e.stopPropagation()}
        className="anim-subir w-full max-w-sm rounded-2xl bg-app p-5 text-fg shadow-app"
      >
        <h2 id="dialogo-titulo" className="text-lg leading-snug font-semibold text-balance">
          {p.titulo}
        </h2>
        {p.tipo === 'confirmar' ? (
          <>
            {p.detalle && (
              <p className="mt-2 text-sm whitespace-pre-line text-muted">{p.detalle}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={cerrar} className={`${boton} flex-1 bg-surface-2`}>
                No
              </button>
              <button
                ref={principal}
                type="button"
                onClick={() => p.responder(true)}
                className={`${boton} flex-[2] ${p.peligro ? 'bg-danger text-bg' : 'bg-ok text-on-accent'}`}
              >
                {p.boton}
              </button>
            </div>
          </>
        ) : otro === null ? (
          <div className="mt-4 flex flex-col gap-2">
            {p.opciones.map((o, i) => (
              <button
                key={o}
                ref={i === 0 ? principal : undefined}
                type="button"
                onClick={() => p.responder(o)}
                className={`${boton} justify-start bg-surface-2 text-left hover:bg-line`}
              >
                {o}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOtro('')}
              className={`${boton} justify-start bg-surface-2 text-left text-muted hover:bg-line`}
            >
              Otro motivo…
            </button>
            <button type="button" onClick={cerrar} className={`${boton} mt-1 text-muted`}>
              Volver
            </button>
          </div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (otro.trim()) p.responder(otro);
            }}
          >
            <input
              autoFocus
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              maxLength={200}
              placeholder="Escriba el motivo"
              className="min-h-12 rounded-lg border border-line bg-surface px-3 text-[15px] outline-none focus:border-fg"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOtro(null)}
                className={`${boton} flex-1 bg-surface-2`}
              >
                Atrás
              </button>
              <button
                type="submit"
                disabled={!otro.trim()}
                className={`${boton} flex-[2] bg-fg text-bg disabled:opacity-40`}
              >
                Listo
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
