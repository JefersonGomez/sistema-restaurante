import { Check, ChefHat, Clock, Ellipsis, ReceiptText, Send, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CuentaDetalle, ItemDetalle, MesaOperacion } from '@menu-qr/shared';
import { Modal } from '@menu-qr/ui';
import { pedirMotivo } from './ui';

// Detalle de una mesa para el mesero (Fase 19): agrupado en el orden en que se actúa
// (por confirmar → listo para servir → en cocina → ya servido) y con los platos iguales juntos.

type Grupo = {
  clave: string;
  nombre: string;
  cantidad: number;
  ids: string[];
  detalle: string; // extras y nota
  estado: ItemDetalle['estado'];
};

// Mismo plato, mismo estado, mismos extras y misma nota → un solo renglón ("2× Gallo pinto").
function agrupar(items: ItemDetalle[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const i of items) {
    const extras = i.modificadores.map((m) => m.nombre).join(', ');
    const clave = [i.platoId, i.estado, extras, i.notas ?? ''].join('¦');
    const g = grupos.get(clave);
    if (g) {
      g.cantidad += i.cantidad;
      g.ids.push(i.id);
    } else
      grupos.set(clave, {
        clave,
        nombre: i.nombreEs,
        cantidad: i.cantidad,
        ids: [i.id],
        detalle: [extras, i.notas && `“${i.notas}”`].filter(Boolean).join(' · '),
        estado: i.estado,
      });
  }
  return [...grupos.values()];
}

// Cambio visible al instante cuando la acción quedó guardada sin conexión.
const conItems = (c: CuentaDetalle, ids: string[], estado: ItemDetalle['estado']) => ({
  ...c,
  pedidos: c.pedidos.map((p) => ({
    ...p,
    items: p.items.map((i) => (ids.includes(i.id) ? { ...i, estado } : i)),
  })),
});
const conPedido = (c: CuentaDetalle, id: string) => ({
  ...c,
  pedidos: c.pedidos.map((p) => (p.id === id ? { ...p, estado: 'CONFIRMADO' as const } : p)),
});

function Seccion({
  titulo,
  punto,
  n,
  children,
}: {
  titulo: string;
  punto: string;
  n: number;
  children: ReactNode;
}) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
        <span className={`size-2 rounded-full ${punto}`} aria-hidden />
        {titulo}
        <span className="tabular-nums">· {n}</span>
      </h3>
      {children}
    </section>
  );
}

function Renglon({ g, apagado, children }: { g: Grupo; apagado?: boolean; children?: ReactNode }) {
  return (
    <li className={`flex min-h-12 items-center gap-3 py-1.5 ${apagado ? 'opacity-60' : ''}`}>
      <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{g.cantidad}×</span>
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-medium">{g.nombre}</p>
        {g.detalle && <p className="truncate text-xs text-muted">{g.detalle}</p>}
      </div>
      {children}
    </li>
  );
}

type Props = {
  mesa: MesaOperacion;
  cuenta: CuentaDetalle | null;
  precio: (n: number) => string;
  // Devuelve true si la acción quedó guardada sin conexión.
  onAccion: (ruta: string, body?: unknown, method?: string) => Promise<boolean>;
  onCuenta: (c: CuentaDetalle) => void;
  onRecargar: () => void;
  onTomar: () => void;
  onCerrar: () => void;
};

export function MesaDetalle({
  mesa,
  cuenta,
  precio,
  onAccion,
  onCuenta,
  onRecargar,
  onTomar,
  onCerrar,
}: Props) {
  const pedidos = cuenta?.pedidos ?? [];
  const porConfirmar = pedidos.filter((p) => p.estado === 'PENDIENTE');
  const activos = pedidos
    .filter((p) => p.estado === 'CONFIRMADO')
    .flatMap((p) => p.items)
    .filter((i) => !i.cancelado);
  const listos = agrupar(activos.filter((i) => i.estado === 'LISTO'));
  const enCocina = agrupar(
    activos.filter((i) => i.estado === 'PENDIENTE' || i.estado === 'EN_PREPARACION'),
  ).sort(
    (a, b) => (a.estado === 'EN_PREPARACION' ? -1 : 0) - (b.estado === 'EN_PREPARACION' ? -1 : 0),
  );
  const servidos = agrupar(activos.filter((i) => i.estado === 'ENTREGADO'));
  const cancelados = agrupar(
    pedidos.flatMap((p) => p.items.filter((i) => i.cancelado || p.estado === 'CANCELADO')),
  );
  const vacia = !porConfirmar.length && !activos.length;

  const servir = async (g: Grupo) => {
    let guardada = false;
    for (const id of g.ids)
      guardada =
        (await onAccion(`/operacion/items/${id}/estado`, { estado: 'ENTREGADO' })) || guardada;
    if (guardada && cuenta) onCuenta(conItems(cuenta, g.ids, 'ENTREGADO'));
    else onRecargar();
  };
  const confirmar = async (id: string) => {
    if ((await onAccion(`/operacion/pedidos/${id}/confirmar`)) && cuenta)
      onCuenta(conPedido(cuenta, id));
    else onRecargar();
  };
  const cancelarPedido = async (id: string) => {
    const motivo = pedirMotivo('¿Por qué se cancela el pedido?');
    if (!motivo) return;
    await onAccion(`/operacion/pedidos/${id}/cancelar`, { motivo });
    onRecargar();
  };
  const cancelarUno = async (g: Grupo) => {
    const motivo = pedirMotivo(`¿Por qué se cancela ${g.nombre}?`);
    if (!motivo) return;
    await onAccion(`/operacion/items/${g.ids[0]}/cancelar`, { motivo });
    onRecargar();
  };

  const suave =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-surface px-4 text-sm font-medium hover:bg-surface-2';

  return (
    <Modal etiqueta={`Mesa ${mesa.numero}`} onCerrar={onCerrar}>
      <div className="flex items-start justify-between gap-3 pt-5">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Mesa {mesa.numero}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {mesa.cuenta?.personas && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden /> {mesa.cuenta.personas}
              </span>
            )}
            {cuenta?.estado === 'PIDIO_CUENTA' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber-ink">
                <ReceiptText className="size-3.5" aria-hidden /> Pidió la cuenta
              </span>
            )}
            {!cuenta && <span>Mesa libre</span>}
          </p>
        </div>
        <button type="button" onClick={onCerrar} className={suave}>
          Cerrar
        </button>
      </div>

      {porConfirmar.map((p) => (
        <Seccion key={p.id} titulo="Por confirmar" punto="bg-amber" n={p.items.length}>
          <div className="rounded-lg border border-amber/40 bg-amber-soft/40 p-3">
            <p className="mb-1 text-xs text-muted">
              Lo pidió {p.origen === 'CLIENTE' ? 'el cliente desde su celular' : 'el mesero'}
              {p.nota && <> · “{p.nota}”</>}
            </p>
            <ul>
              {agrupar(p.items).map((g) => (
                <Renglon key={g.clave} g={g} />
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => confirmar(p.id)}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-purple px-4 text-[15px] font-semibold text-on-accent"
              >
                <Send className="size-4" aria-hidden /> Confirmar y enviar a cocina
              </button>
              <button type="button" onClick={() => cancelarPedido(p.id)} className={suave}>
                Cancelar
              </button>
            </div>
          </div>
        </Seccion>
      ))}

      {listos.length > 0 && (
        <Seccion titulo="Listo para servir" punto="bg-ok" n={listos.length}>
          <ul className="divide-y divide-line rounded-lg bg-ok-soft/50 px-3">
            {listos.map((g) => (
              <Renglon key={g.clave} g={g}>
                <button
                  type="button"
                  onClick={() => servir(g)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-ok px-4 text-sm font-semibold text-on-accent"
                >
                  <Check className="size-4" aria-hidden /> Servido
                </button>
              </Renglon>
            ))}
          </ul>
        </Seccion>
      )}

      {enCocina.length > 0 && (
        <Seccion titulo="En cocina" punto="bg-info" n={enCocina.length}>
          <ul className="divide-y divide-line">
            {enCocina.map((g) => (
              <Renglon key={g.clave} g={g}>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                  {g.estado === 'EN_PREPARACION' ? (
                    <>
                      <ChefHat className="size-3.5" aria-hidden /> Preparando
                    </>
                  ) : (
                    <>
                      <Clock className="size-3.5" aria-hidden /> En espera
                    </>
                  )}
                </span>
                <details className="relative shrink-0">
                  <summary
                    className="grid size-11 cursor-pointer list-none place-items-center rounded-md hover:bg-surface-2"
                    aria-label={`Más opciones de ${g.nombre}`}
                  >
                    <Ellipsis className="size-5" aria-hidden />
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-line bg-surface p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => cancelarUno(g)}
                      className="min-h-11 w-full rounded px-3 text-left text-sm text-danger hover:bg-danger-soft"
                    >
                      Cancelar {g.ids.length > 1 ? 'uno' : 'este plato'}
                    </button>
                  </div>
                </details>
              </Renglon>
            ))}
          </ul>
        </Seccion>
      )}

      {servidos.length > 0 && (
        <Seccion titulo="Ya servido" punto="bg-muted" n={servidos.length}>
          <ul className="divide-y divide-line">
            {servidos.map((g) => (
              <Renglon key={g.clave} g={g} apagado />
            ))}
          </ul>
        </Seccion>
      )}

      {cancelados.length > 0 && (
        <details className="mt-4 text-sm text-muted">
          <summary className="cursor-pointer py-2">Cancelados ({cancelados.length})</summary>
          <ul>
            {cancelados.map((g) => (
              <Renglon key={g.clave} g={g} apagado />
            ))}
          </ul>
        </details>
      )}

      {cuenta && vacia && (
        <p className="mt-4 text-sm text-muted">Todavía no hay pedidos en esta cuenta.</p>
      )}

      <div className="sticky bottom-0 mt-4 border-t border-line bg-app pt-3 pb-1">
        {cuenta && cuenta.total > 0 && (
          <p className="mb-3 flex justify-between font-semibold">
            <span>Total de la cuenta</span>
            <span className="tabular-nums">{precio(cuenta.total)}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onTomar}
          className="flex min-h-12 w-full flex-col items-center justify-center rounded-md bg-surface-2 px-4 py-2 text-[15px] font-semibold hover:bg-surface"
        >
          Tomar pedido
          <span className="text-xs font-normal text-muted">Para clientes sin celular</span>
        </button>
      </div>
    </Modal>
  );
}
