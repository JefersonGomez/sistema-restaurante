import { useCallback, useEffect, useState } from 'react';
import type { EstadoItem, ItemDetalle, PedidoEstacion } from '@menu-qr/shared';
import { activarSonido, sonar, sonidoActivo } from './alertas';
import { api } from './api';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { BotonSonido, Conexion, Encabezado, hora } from './ui';

// Umbrales del temporizador por pedido (minutos desde que se confirmó).
const UMBRAL_AMARILLO_MIN = 10;
const UMBRAL_ROJO_MIN = 20;

const SIGUIENTE: Partial<Record<EstadoItem, EstadoItem>> = {
  PENDIENTE: 'EN_PREPARACION',
  EN_PREPARACION: 'LISTO',
};
const ESTILO_ITEM: Record<EstadoItem, string> = {
  PENDIENTE: 'bg-white border-stone-300',
  EN_PREPARACION: 'bg-amber-50 border-amber-400',
  LISTO: 'bg-emerald-50 border-emerald-500 text-emerald-900',
  ENTREGADO: 'bg-stone-100 border-stone-200',
};
const ETIQUETA: Record<EstadoItem, string> = {
  PENDIENTE: 'Nuevo',
  EN_PREPARACION: 'Preparando',
  LISTO: 'Listo ✓',
  ENTREGADO: 'Entregado',
};

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
          lista.some((e) => e.id === actual) ? actual : (lista[0]?.id ?? null),
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
    if (!estacionId) return;
    try {
      setPedidos(await api<PedidoEstacion[]>(`/operacion/estaciones/${estacionId}/items`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [estacionId]);
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
        if (p.items.some((i) => i.estacionId === estacionId)) sonar(3);
        refrescar();
      },
      'item:estado': refrescar,
      'pedido:cancelado': refrescar,
      'cuenta:cerrada': refrescar,
      'menu:actualizado': () => verAgotados && cargarPlatos(),
    },
    cargar,
  );

  const avanzar = async (item: ItemDetalle) => {
    const estado = SIGUIENTE[item.estado];
    if (!estado) return;
    // Cambio optimista; si la API lo rechaza (otro dispositivo ya lo movió) se resincroniza.
    setPedidos((ps) =>
      ps.map((p) => ({
        ...p,
        items: p.items.map((i) => (i.id === item.id ? { ...i, estado } : i)),
      })),
    );
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

  const nombreEstacion = estaciones.find((e) => e.id === estacionId)?.nombre ?? 'Estación';
  return (
    <div className="min-h-dvh bg-stone-100">
      <Encabezado titulo={`Pantalla de ${nombreEstacion}`}>
        {estaciones.length > 1 && (
          <select
            value={estacionId ?? ''}
            onChange={(e) => setEstacionId(e.target.value)}
            className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
            aria-label="Estación"
          >
            {estaciones.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => {
            setVerAgotados((v) => !v);
            cargarPlatos();
          }}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          Agotados
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

      {error && <p className="m-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {verAgotados && (
        <section className="m-3 rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 font-semibold">Marcar platos agotados</h2>
          <div className="flex flex-wrap gap-2">
            {platos
              .filter((p) => p.activo && (!estacionId || p.estacionId === estacionId))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => alternarAgotado(p)}
                  aria-pressed={p.agotado}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    p.agotado ? 'bg-red-600 text-white' : 'border border-stone-300 bg-white'
                  }`}
                >
                  {p.agotado ? '⛔ ' : ''}
                  {p.nombreEs}
                </button>
              ))}
          </div>
        </section>
      )}

      {pedidos.length === 0 ? (
        <p className="p-10 text-center text-lg text-stone-500">Sin pedidos activos 🎉</p>
      ) : (
        <main className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3 p-3">
          {pedidos.map((p) => {
            const minutos = Math.floor((ahora - new Date(p.confirmadoEn).getTime()) / 60_000);
            const color =
              minutos >= UMBRAL_ROJO_MIN
                ? 'border-red-600 bg-red-50'
                : minutos >= UMBRAL_AMARILLO_MIN
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-stone-300 bg-white';
            return (
              <article
                key={p.pedidoId}
                className={`flex flex-col rounded-xl border-2 shadow-sm ${color}`}
              >
                <header className="flex items-baseline justify-between border-b border-black/10 px-3 py-2">
                  <span className="text-2xl font-bold">Mesa {p.mesa.numero}</span>
                  <span className="text-sm tabular-nums">
                    {hora(p.confirmadoEn)} · <strong>{minutos} min</strong>
                  </span>
                </header>
                {p.nota && (
                  <p className="bg-yellow-200 px-3 py-1 text-sm font-semibold">📝 {p.nota}</p>
                )}
                <ul className="flex-1 space-y-2 p-2">
                  {p.items.map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => avanzar(i)}
                        disabled={!SIGUIENTE[i.estado]}
                        className={`w-full rounded-lg border-2 p-2 text-left ${ESTILO_ITEM[i.estado]}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-lg font-semibold">
                            {i.cantidad}× {i.nombreEs}
                          </span>
                          <span className="shrink-0 text-xs font-medium uppercase">
                            {ETIQUETA[i.estado]}
                          </span>
                        </div>
                        {i.modificadores.length > 0 && (
                          <p className="text-sm">
                            {i.modificadores.map((m) => m.nombre).join(' · ')}
                          </p>
                        )}
                        {i.notas && (
                          <p className="mt-1 rounded bg-yellow-200 px-1.5 py-0.5 text-sm font-semibold">
                            ⚠ {i.notas}
                          </p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </main>
      )}
    </div>
  );
}
