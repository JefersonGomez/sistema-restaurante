import { Ban, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MINUTOS_DEMORA,
  type EstadoItem,
  type ItemDetalle,
  type PedidoEstacion,
} from '@menu-qr/shared';
import { activarSonido, sonar, sonidoActivo } from './alertas';
import { api } from './api';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { BotonSonido, Conexion, Encabezado, hora } from './ui';

// Umbrales del temporizador por pedido (minutos desde que se confirmó). El rojo es el mismo
// "demorado" que cuentan los reportes.
const UMBRAL_AMARILLO_MIN = 10;
const UMBRAL_ROJO_MIN = MINUTOS_DEMORA;
const DESHACER_MS = 5000;

const SIGUIENTE: Partial<Record<EstadoItem, EstadoItem>> = {
  PENDIENTE: 'EN_PREPARACION',
  EN_PREPARACION: 'LISTO',
};
const ESTILO_ITEM: Record<EstadoItem, string> = {
  PENDIENTE: 'bg-surface border-line',
  EN_PREPARACION: 'bg-amber-soft border-amber',
  LISTO: 'bg-ok-soft border-ok text-ok',
  ENTREGADO: 'bg-surface-2 border-line text-muted',
};
const ETIQUETA: Record<EstadoItem, string> = {
  PENDIENTE: 'Tocar para empezar',
  EN_PREPARACION: 'Tocar cuando esté listo',
  LISTO: 'Listo ✓',
  ENTREGADO: 'Entregado',
};
const NOMBRE_ESTADO: Record<EstadoItem, string> = {
  PENDIENTE: 'Nuevo',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  ENTREGADO: 'Entregado',
};

// Cada pedido va en la columna de su ítem menos avanzado.
const COLUMNAS = [
  { id: 'nuevos', titulo: 'Nuevos' },
  { id: 'prep', titulo: 'En preparación' },
  { id: 'listos', titulo: 'Listos' },
] as const;
const columnaDe = (p: PedidoEstacion) =>
  p.items.some((i) => i.estado === 'PENDIENTE')
    ? 'nuevos'
    : p.items.some((i) => i.estado === 'EN_PREPARACION')
      ? 'prep'
      : 'listos';

type Deshacible = { item: ItemDetalle; mesa: number; estado: EstadoItem };

type Estacion = { id: string; nombre: string };
type Plato = {
  id: string;
  nombreEs: string;
  agotado: boolean;
  activo: boolean;
  estacionId: string;
};

const CLAVE_ESTACION = 'staff-estacion';
const leerEstacion = () => {
  try {
    return localStorage.getItem(CLAVE_ESTACION);
  } catch {
    return null;
  }
};

// Mantiene la pantalla encendida mientras la pestaña esté visible (si el navegador lo permite).
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const pedir = async () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      lock = await navigator.wakeLock.request('screen').catch(() => null);
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      document.removeEventListener('visibilitychange', pedir);
      void lock?.release();
    };
  }, []);
}

// "todas": un usuario de cocina sin estación asignada (o el dueño) ve cocina y bar juntos.
const TODAS = 'todas';

export function EstacionPage() {
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [estacionId, setEstacionId] = useState<string | null>(leerEstacion);
  const [pedidos, setPedidos] = useState<PedidoEstacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const [sonido, setSonido] = useState(sonidoActivo());
  const [verAgotados, setVerAgotados] = useState(false);
  const [platos, setPlatos] = useState<Plato[]>([]);
  useWakeLock();

  useEffect(() => {
    api<Estacion[]>('/operacion/estaciones').then(
      (lista) => {
        setEstaciones(lista);
        setEstacionId((actual) =>
          (actual === TODAS && lista.length > 1) || lista.some((e) => e.id === actual)
            ? actual
            : lista.length > 1
              ? TODAS
              : (lista[0]?.id ?? null),
        );
      },
      (e: Error) => setError(e.message),
    );
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    try {
      if (estacionId) localStorage.setItem(CLAVE_ESTACION, estacionId);
    } catch {
      // sin almacenamiento
    }
  }, [estacionId]);

  const cargar = useCallback(async () => {
    if (!estacionId || estaciones.length === 0) return;
    const ids = estacionId === TODAS ? estaciones.map((e) => e.id) : [estacionId];
    try {
      const listas = await Promise.all(
        ids.map((id) => api<PedidoEstacion[]>(`/operacion/estaciones/${id}/items`)),
      );
      // Un mismo pedido puede tener ítems de cocina y de bar: se juntan en una tarjeta.
      const porPedido = new Map<string, PedidoEstacion>();
      for (const p of listas.flat()) {
        const previo = porPedido.get(p.pedidoId);
        porPedido.set(p.pedidoId, previo ? { ...previo, items: [...previo.items, ...p.items] } : p);
      }
      setPedidos(
        [...porPedido.values()].sort((a, b) => a.confirmadoEn.localeCompare(b.confirmadoEn)),
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [estacionId, estaciones]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarPlatos = useCallback(async () => {
    setPlatos(await api<Plato[]>('/platos').catch(() => []));
  }, []);

  const refrescar = useRefrescoAgrupado(cargar);
  const conectado = useTiempoReal(
    {
      // Llega solo a las salas de estación correspondientes; el dueño recibe las de todas.
      'pedido:confirmado': (p: { items: ItemDetalle[] }) => {
        if (estacionId === TODAS || p.items.some((i) => i.estacionId === estacionId)) sonar(3);
        refrescar();
      },
      'item:estado': refrescar,
      'pedido:cancelado': refrescar,
      'cuenta:cerrada': refrescar,
      'menu:actualizado': () => verAgotados && cargarPlatos(),
    },
    cargar,
  );

  // "Deshacer" del último toque, visible DESHACER_MS.
  const [deshacible, setDeshacible] = useState<Deshacible | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const fijarEstado = (id: string, estado: EstadoItem) =>
    setPedidos((ps) =>
      ps.map((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, estado } : i)) })),
    );

  const deshacer = async () => {
    if (!deshacible) return;
    const { item, estado } = deshacible;
    setDeshacible(null);
    fijarEstado(item.id, item.estado);
    await api(`/operacion/items/${item.id}/deshacer`, { method: 'POST', body: { estado } }).catch(
      (e: Error) => setError(e.message),
    );
    refrescar();
  };

  const avanzar = async (item: ItemDetalle, mesa: number) => {
    const estado = SIGUIENTE[item.estado];
    if (!estado) return;
    clearTimeout(temporizador.current);
    setDeshacible({ item, mesa, estado });
    temporizador.current = setTimeout(() => setDeshacible(null), DESHACER_MS);
    // Cambio optimista; si la API lo rechaza (otro dispositivo ya lo movió) se resincroniza.
    fijarEstado(item.id, estado);
    await api(`/operacion/items/${item.id}/estado`, { method: 'PATCH', body: { estado } }).catch(
      (e: Error) => setError(e.message),
    );
    refrescar();
  };

  const alternarAgotado = async (p: Plato) => {
    await api(`/platos/${p.id}/agotado`, { method: 'PATCH', body: { agotado: !p.agotado } }).catch(
      () => {},
    );
    cargarPlatos();
  };

  const nombreEstacion =
    estacionId === TODAS
      ? 'Cocina y bar'
      : (estaciones.find((e) => e.id === estacionId)?.nombre ?? 'Estación');
  const boton =
    'inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface px-3 text-sm font-medium hover:bg-surface-2';

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <Encabezado titulo={nombreEstacion}>
        {estaciones.length > 1 && (
          <select
            value={estacionId ?? ''}
            onChange={(e) => setEstacionId(e.target.value)}
            className="min-h-11 rounded-md border border-line bg-surface px-2 text-sm"
            aria-label="Estación"
          >
            <option value={TODAS}>Todas</option>
            {estaciones.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          aria-pressed={verAgotados}
          onClick={() => {
            setVerAgotados((v) => !v);
            cargarPlatos();
          }}
          className={boton}
        >
          <Ban className="size-4" aria-hidden /> <span className="max-sm:sr-only">Agotados</span>
        </button>
        <BotonSonido
          activo={sonido}
          onActivar={() => {
            activarSonido();
            setSonido(true);
          }}
        />
        <Conexion conectado={conectado} />
      </Encabezado>

      {error && (
        <p role="alert" className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}. Se vuelve a sincronizar solo; si sigue, revise la conexión.
        </p>
      )}

      {verAgotados && (
        <section className="m-3 rounded-lg bg-app p-4 shadow-tarjeta">
          <h2 className="mb-1 font-semibold">Marcar platos agotados</h2>
          <p className="mb-3 text-sm text-muted">Los agotados dejan de poder pedirse en el menú.</p>
          <div className="flex flex-wrap gap-2">
            {platos
              .filter(
                (p) =>
                  p.activo && (!estacionId || estacionId === TODAS || p.estacionId === estacionId),
              )
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => alternarAgotado(p)}
                  aria-pressed={p.agotado}
                  className={`min-h-11 rounded-full px-4 text-sm font-medium ${
                    p.agotado ? 'bg-danger text-on-accent' : 'bg-surface hover:bg-surface-2'
                  }`}
                >
                  {p.agotado ? 'Agotado · ' : ''}
                  {p.nombreEs}
                </button>
              ))}
          </div>
        </section>
      )}

      <main className="grid flex-1 items-start gap-3 p-3 md:grid-cols-3">
        {COLUMNAS.map((col) => {
          const lista = pedidos.filter((p) => columnaDe(p) === col.id);
          return (
            <section
              key={col.id}
              aria-labelledby={`col-${col.id}`}
              className="flex min-w-0 flex-col gap-3"
            >
              <h2
                id={`col-${col.id}`}
                className="flex items-center justify-between px-1 text-sm font-semibold tracking-wide text-muted uppercase"
              >
                {col.titulo}
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs tabular-nums">
                  {lista.length}
                </span>
              </h2>
              {lista.length === 0 && (
                <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                  {col.id === 'nuevos' ? 'Sin pedidos nuevos' : 'Nada por aquí'}
                </p>
              )}
              {lista.map((p) => {
                const minutos = Math.floor((ahora - new Date(p.confirmadoEn).getTime()) / 60_000);
                const borde =
                  col.id === 'listos'
                    ? 'border-ok'
                    : minutos >= UMBRAL_ROJO_MIN
                      ? 'border-danger'
                      : minutos >= UMBRAL_AMARILLO_MIN
                        ? 'border-amber'
                        : 'border-transparent';
                const reloj =
                  col.id === 'listos'
                    ? 'bg-ok-soft text-ok'
                    : minutos >= UMBRAL_ROJO_MIN
                      ? 'bg-danger text-on-accent'
                      : minutos >= UMBRAL_AMARILLO_MIN
                        ? 'bg-amber text-on-amber'
                        : 'bg-surface-2 text-fg';
                return (
                  <article
                    key={p.pedidoId}
                    className={`rounded-lg border-2 bg-app shadow-tarjeta ${borde}`}
                  >
                    <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <span className="text-3xl font-bold tracking-tight">
                        Mesa {p.mesa.numero}
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded-full px-3 py-1 text-base font-bold tabular-nums ${reloj}`}
                        >
                          {minutos} min
                        </span>
                        <span className="text-xs text-muted">{hora(p.confirmadoEn)}</span>
                      </span>
                    </header>
                    {p.nota && (
                      <p className="bg-amber-soft px-4 py-2 font-semibold text-amber-ink">
                        Nota: {p.nota}
                      </p>
                    )}
                    <ul className="space-y-2 p-3">
                      {p.items.map((i) => (
                        <li key={i.id}>
                          <button
                            type="button"
                            onClick={() => avanzar(i, p.mesa.numero)}
                            disabled={!SIGUIENTE[i.estado]}
                            className={`min-h-14 w-full rounded-md border-2 p-3 text-left transition-transform active:scale-[0.98] disabled:cursor-default ${ESTILO_ITEM[i.estado]}`}
                          >
                            <span className="block text-xl font-semibold">
                              <span className="tabular-nums">{i.cantidad}×</span> {i.nombreEs}
                            </span>
                            {i.modificadores.length > 0 && (
                              <span className="mt-0.5 block text-base">
                                {i.modificadores.map((m) => m.nombre).join(' · ')}
                              </span>
                            )}
                            {i.notas && (
                              <span className="mt-1.5 block rounded-sm bg-amber px-2 py-1 text-base font-semibold text-on-amber">
                                {i.notas}
                              </span>
                            )}
                            <span className="mt-1.5 block text-xs font-medium tracking-wide uppercase opacity-80">
                              {ETIQUETA[i.estado]}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </section>
          );
        })}
      </main>

      {deshacible && (
        <div
          role="status"
          className="anim-aparecer fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-[14px] bg-fg py-2 pr-2 pl-4 text-app shadow-app"
        >
          <span className="text-sm">
            Mesa {deshacible.mesa} · {deshacible.item.nombreEs} → {NOMBRE_ESTADO[deshacible.estado]}
          </span>
          <button
            type="button"
            onClick={deshacer}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-amber px-3 text-sm font-semibold text-on-amber"
          >
            <Undo2 className="size-4" aria-hidden /> Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
