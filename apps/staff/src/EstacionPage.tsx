import { Ban, Check, LayoutGrid, Rows3, Search, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  avisoAgrupado,
  tiempoTranscurrido,
  type EstadoItem,
  type ItemDetalle,
  type PedidoEstacion,
  type TipoCuenta,
} from '@menu-qr/shared';
import { api } from './api';
import { avisar } from './avisos';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import {
  BotonSonido,
  ColumnaTablero,
  Conexion,
  Encabezado,
  hora,
  Kpi,
  Segmentado,
  tonoTiempo,
} from './ui';

// Cocina y bar (KDS, Fase 10): pensado para muchos pedidos a la vez.
const LIMITES = [10, 15, 20, 30]; // minutos para considerar un pedido atrasado
const OLVIDADO_MS = 2 * 60 * 60_000; // más de 2 h: sale de la cola y va al aviso rojo
const ESPERA_LISTO_MS = 5 * 60_000; // listo sin entregar: "Esperando hace…"
const DESHACER_MS = 5000;
const TODAS = 'todas';

type Columna = 'nuevos' | 'prep' | 'listos';
type Estacion = { id: string; nombre: string };
type Plato = {
  id: string;
  nombreEs: string;
  agotado: boolean;
  activo: boolean;
  estacionId: string;
};
type Vista = PedidoEstacion & {
  columna: Columna;
  edad: number; // ms desde que se confirmó
  listoHace: number | null; // ms desde que quedó listo el último plato
  atrasado: boolean;
};
type Deshacible = { item: ItemDetalle; lugar: string; estado: EstadoItem };

// Preferencias del dispositivo (estación, vista, límite); sin almacenamiento, los valores por defecto.
const leer = (clave: string) => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (clave: string, valor: string) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // sin almacenamiento
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

const CANAL: Record<TipoCuenta, { texto: string; clase: string }> = {
  MESA: { texto: 'Salón', clase: 'bg-surface-2 text-muted' },
  RECOGER: { texto: 'Para llevar', clase: 'bg-info-soft text-info' },
  DOMICILIO: { texto: 'En línea', clase: 'bg-linea-soft text-linea' },
};
const nombreDe = (p: PedidoEstacion) =>
  p.canal === 'MESA'
    ? p.lugar
    : `${p.canal === 'RECOGER' ? 'Llevar' : 'Domicilio'} #${p.numero ?? ''}`;
const hecho = (i: ItemDetalle) => i.estado === 'LISTO' || i.estado === 'ENTREGADO';

// Etiquetas del plato: alergia (roja, primero), cambios (ámbar), notas (gris) y la estación.
type Etiqueta = { texto: string; clase: string; orden: number };
const CAMBIO = /^(sin|extra|con|más|mas|poco|doble|aparte)\b/i;
function etiquetasDe(i: ItemDetalle, estacion: string | null): Etiqueta[] {
  const lista: Etiqueta[] = i.modificadores.map((m) =>
    CAMBIO.test(m.nombre)
      ? { texto: m.nombre, clase: 'bg-amber text-bg', orden: 1 }
      : { texto: m.nombre, clase: 'bg-surface-2 text-muted', orden: 2 },
  );
  if (i.notas)
    lista.push(
      /alerg/i.test(i.notas)
        ? { texto: i.notas, clase: 'bg-danger text-bg', orden: 0 }
        : { texto: i.notas, clase: 'bg-surface-2 text-fg', orden: 2 },
    );
  if (estacion)
    lista.push({ texto: estacion.toUpperCase(), clase: 'bg-teal-soft text-teal', orden: 3 });
  return lista.sort((a, b) => a.orden - b.orden);
}

function Tarjeta({
  p,
  items,
  limiteMs,
  compacta,
  resaltado,
  nombreEstacion,
  onItem,
  onPedido,
}: {
  p: Vista;
  items: ItemDetalle[];
  limiteMs: number;
  compacta: boolean;
  resaltado: string | null;
  nombreEstacion: (i: ItemDetalle) => string | null;
  onItem: (p: Vista, i: ItemDetalle) => void;
  onPedido: (p: Vista, estado: 'EN_PREPARACION' | 'LISTO') => void;
}) {
  const proporcion = p.edad / limiteMs;
  const pildora = tonoTiempo(proporcion);
  const barra = p.atrasado ? 'bg-danger' : p.columna === 'nuevos' ? 'bg-info' : 'bg-amber';
  const listos = items.filter(hecho).length;
  const meta = [p.numero ? `#${p.numero}` : null, p.atendio, hora(p.confirmadoEn)]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl bg-app ${
        p.atrasado
          ? 'border-2 border-danger shadow-[0_0_0_4px_var(--peligro-suave)]'
          : 'border border-line'
      }`}
    >
      <header
        className={`flex items-start gap-2 ${compacta ? 'px-2.5 pt-2 pb-1.5' : 'px-3 pt-3 pb-2'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-display text-[22px] leading-tight font-extrabold">{nombreDe(p)}</h3>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${CANAL[p.canal].clase}`}
            >
              {CANAL[p.canal].texto}
            </span>
            {p.atrasado && (
              <span className="rounded-md bg-danger px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-bg">
                ATRASADO
              </span>
            )}
          </div>
          {!compacta && meta && <p className="mt-0.5 truncate text-xs text-muted">{meta}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${pildora}`}
        >
          {tiempoTranscurrido(p.edad)}
        </span>
      </header>
      <div className="h-1 bg-surface-2" aria-hidden>
        <div
          className={`h-full ${barra}`}
          style={{ width: `${Math.min(100, proporcion * 100)}%` }}
        />
      </div>
      {p.nota && (
        <p className="mx-2 mt-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-sm font-semibold text-amber">
          Nota: {p.nota}
        </p>
      )}
      <ul className={`flex flex-col gap-1.5 ${compacta ? 'p-1.5' : 'p-2'}`}>
        {items.map((i) => {
          const listo = hecho(i);
          const marcado = !listo && resaltado === i.nombreEs;
          return (
            <li key={i.id}>
              <button
                type="button"
                aria-pressed={listo}
                onClick={() => onItem(p, i)}
                disabled={listo}
                className={`flex min-h-11 w-full items-start gap-2.5 rounded-lg border px-2.5 text-left disabled:cursor-default ${
                  compacta ? 'py-1.5' : 'py-2'
                } ${
                  listo
                    ? 'border-transparent bg-ok-soft'
                    : marcado
                      ? 'border-info bg-info-soft'
                      : 'border-line bg-surface hover:bg-surface-2'
                }`}
              >
                <span className="font-display text-[17px] leading-snug font-extrabold text-amber tabular-nums">
                  {i.cantidad}×
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[17px] leading-snug font-bold ${listo ? 'text-ok line-through' : ''}`}
                  >
                    {i.nombreEs}
                  </span>
                  {(() => {
                    const etiquetas = etiquetasDe(i, nombreEstacion(i));
                    return (
                      etiquetas.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {etiquetas.map((e, n) => (
                            <span
                              key={n}
                              className={`rounded px-1.5 py-0.5 text-xs font-bold ${e.clase}`}
                            >
                              {e.texto}
                            </span>
                          ))}
                        </span>
                      )
                    );
                  })()}
                </span>
                <span
                  aria-hidden
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                    listo
                      ? 'border-ok bg-ok text-bg'
                      : i.estado === 'EN_PREPARACION'
                        ? 'border-amber'
                        : 'border-line'
                  }`}
                >
                  {listo && <Check className="size-4" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <footer
        className={`mt-auto flex items-center justify-between gap-2 border-t border-line ${compacta ? 'p-1.5' : 'p-2.5'}`}
      >
        <span className="text-sm text-muted tabular-nums">
          {listos} de {items.length} listos
        </span>
        {p.columna === 'nuevos' ? (
          <button
            type="button"
            onClick={() => onPedido(p, 'EN_PREPARACION')}
            className="min-h-11 rounded-[10px] bg-info px-4 text-sm font-bold text-bg"
          >
            Empezar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPedido(p, 'LISTO')}
            className="min-h-11 rounded-[10px] bg-surface-2 px-4 text-sm font-bold hover:bg-line"
          >
            Marcar todo listo
          </button>
        )}
      </footer>
    </article>
  );
}

export function EstacionPage() {
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [filtro, setFiltro] = useState<string>(() => leer('staff-estacion') ?? TODAS);
  const [pedidos, setPedidos] = useState<PedidoEstacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const [buscar, setBuscar] = useState('');
  const [compacta, setCompacta] = useState(() => leer('kds-vista') === 'compacta');
  const [limiteMin, setLimiteMin] = useState(() => Number(leer('kds-limite')) || 15);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [verAgotados, setVerAgotados] = useState(false);
  const [platos, setPlatos] = useState<Plato[]>([]);
  useWakeLock();

  useEffect(() => {
    api<Estacion[]>('/operacion/estaciones').then(setEstaciones, (e: Error) => setError(e.message));
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => guardar('staff-estacion', filtro), [filtro]);
  useEffect(() => guardar('kds-vista', compacta ? 'compacta' : 'normal'), [compacta]);
  useEffect(() => guardar('kds-limite', String(limiteMin)), [limiteMin]);

  // Se cargan todas las estaciones visibles (para los contadores) y se filtra en pantalla.
  const cargar = useCallback(async () => {
    if (estaciones.length === 0) return;
    try {
      const listas = await Promise.all(
        estaciones.map((e) => api<PedidoEstacion[]>(`/operacion/estaciones/${e.id}/items`)),
      );
      // Un pedido con platos de cocina y de bar llega dos veces: se junta en una tarjeta.
      const porPedido = new Map<string, PedidoEstacion>();
      for (const p of listas.flat()) {
        const previo = porPedido.get(p.pedidoId);
        porPedido.set(p.pedidoId, previo ? { ...previo, items: [...previo.items, ...p.items] } : p);
      }
      setPedidos([...porPedido.values()]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [estaciones]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarPlatos = useCallback(async () => {
    setPlatos(await api<Plato[]>('/platos').catch(() => []));
  }, []);
  const refrescar = useRefrescoAgrupado(cargar);
  const conectado = useTiempoReal(
    {
      'pedido:confirmado': refrescar, // el aviso con sonido lo da AvisosGlobales
      'item:estado': refrescar,
      'pedido:cancelado': refrescar,
      'cuenta:cerrada': refrescar,
      'menu:actualizado': () => verAgotados && cargarPlatos(),
    },
    cargar,
  );

  const filtroValido = filtro === TODAS || estaciones.some((e) => e.id === filtro) ? filtro : TODAS;
  // La estación principal no lleva etiqueta: la que se llama "Cocina" (o la primera).
  const primeraEstacion = (estaciones.find((e) => /cocina/i.test(e.nombre)) ?? estaciones[0])?.id;
  const nombreEstacion = useCallback(
    (i: ItemDetalle) =>
      filtroValido === TODAS && i.estacionId !== primeraEstacion
        ? (estaciones.find((e) => e.id === i.estacionId)?.nombre ?? null)
        : null,
    [filtroValido, primeraEstacion, estaciones],
  );
  const limiteMs = limiteMin * 60_000;

  // Pedidos con los platos de la estación elegida, en su columna y con sus tiempos.
  const clasificar = useCallback(
    (estacion: string) =>
      pedidos.flatMap((p): Vista[] => {
        const items = p.items.filter((i) => estacion === TODAS || i.estacionId === estacion);
        if (items.length === 0) return [];
        const columna: Columna = items.every(hecho)
          ? 'listos'
          : items.every((i) => i.estado === 'PENDIENTE')
            ? 'nuevos'
            : 'prep';
        const edad = ahora - Date.parse(p.confirmadoEn);
        const listoEn = Math.max(...items.map((i) => (i.listoEn ? Date.parse(i.listoEn) : 0)));
        return [
          {
            ...p,
            items,
            columna,
            edad,
            listoHace: columna === 'listos' && listoEn ? ahora - listoEn : null,
            atrasado: columna !== 'listos' && edad > limiteMs,
          },
        ];
      }),
    [pedidos, ahora, limiteMs],
  );
  const todos = clasificar(filtroValido);
  const olvidados = todos.filter((p) => p.edad > OLVIDADO_MS);
  const activos = todos.filter((p) => p.edad <= OLVIDADO_MS);
  const nuevos = activos.filter((p) => p.columna === 'nuevos');
  const enPrep = activos.filter((p) => p.columna === 'prep');
  const listos = activos.filter((p) => p.columna === 'listos');
  const atrasados = activos.filter((p) => p.atrasado);
  const enCurso = [...nuevos, ...enPrep];
  const esperaPromedio = enCurso.length
    ? enCurso.reduce((n, p) => n + p.edad, 0) / enCurso.length
    : 0;

  // Contador por estación: pedidos con trabajo pendiente (nuevos + en preparación).
  const pendientesDe = (estacion: string) =>
    clasificar(estacion).filter((p) => p.edad <= OLVIDADO_MS && p.columna !== 'listos').length;

  // Buscador: número de mesa, número de pedido o parte del nombre.
  const q = buscar.trim().toLowerCase();
  const coincide = (p: Vista) =>
    !q ||
    String(p.mesa?.numero ?? '') === q ||
    String(p.numero ?? '') === q.replace('#', '') ||
    p.lugar.toLowerCase().includes(q);

  // "Pendiente ahora": cantidades de platos sin terminar, para cocinarlos en tanda.
  const suma = new Map<string, number>();
  for (const p of enCurso)
    for (const i of p.items)
      if (!hecho(i)) suma.set(i.nombreEs, (suma.get(i.nombreEs) ?? 0) + i.cantidad);
  const pendienteAhora = [...suma.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );

  // Aviso (con sonido) cuando un pedido pasa a atrasado.
  const yaAvisados = useRef(new Set<string>());
  const claveAtrasados = atrasados.map((p) => p.pedidoId).join(',');
  useEffect(() => {
    avisoAgrupado(yaAvisados.current, claveAtrasados ? claveAtrasados.split(',') : [], (n) =>
      avisar('cocina', n === 1 ? 'Un pedido está atrasado' : `${n} pedidos están atrasados`),
    );
  }, [claveAtrasados]);

  // "Deshacer" del último toque, visible DESHACER_MS.
  const [deshacible, setDeshacible] = useState<Deshacible | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const fijar = (ids: string[], estado: EstadoItem) =>
    setPedidos((ps) =>
      ps.map((p) => ({
        ...p,
        items: p.items.map((i) =>
          ids.includes(i.id)
            ? { ...i, estado, listoEn: estado === 'LISTO' ? new Date().toISOString() : i.listoEn }
            : i,
        ),
      })),
    );
  const llamar = async (fn: () => Promise<unknown>) => {
    await fn().catch((e: Error) => setError(e.message));
    refrescar();
  };

  // Tocar un plato: en un pedido nuevo lo empieza; en preparación lo marca listo.
  const tocarItem = (p: Vista, i: ItemDetalle) => {
    const estado: EstadoItem = p.columna === 'nuevos' ? 'EN_PREPARACION' : 'LISTO';
    clearTimeout(temporizador.current);
    setDeshacible({ item: i, lugar: nombreDe(p), estado });
    temporizador.current = setTimeout(() => setDeshacible(null), DESHACER_MS);
    fijar([i.id], estado);
    llamar(() =>
      api(`/operacion/pedidos/${p.pedidoId}/avanzar`, {
        method: 'POST',
        body: { estado, itemIds: [i.id] },
      }),
    );
  };
  const avanzarPedido = (p: Vista, estado: 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO') => {
    const ids = p.items.map((i) => i.id);
    fijar(ids, estado);
    llamar(() =>
      api(`/operacion/pedidos/${p.pedidoId}/avanzar`, {
        method: 'POST',
        body: { estado, itemIds: ids },
      }),
    );
  };
  const deshacer = () => {
    if (!deshacible) return;
    const { item, estado } = deshacible;
    setDeshacible(null);
    fijar([item.id], estado === 'LISTO' ? 'EN_PREPARACION' : 'PENDIENTE');
    llamar(() => api(`/operacion/items/${item.id}/deshacer`, { method: 'POST', body: { estado } }));
  };

  const alternarAgotado = async (p: Plato) => {
    await api(`/platos/${p.id}/agotado`, { method: 'PATCH', body: { agotado: !p.agotado } }).catch(
      () => {},
    );
    cargarPlatos();
  };

  const grid = `grid gap-2.5 ${compacta ? '[grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]' : '[grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]'}`;
  const tarjeta = (p: Vista) => (
    <Tarjeta
      key={p.pedidoId}
      p={p}
      items={p.items}
      limiteMs={limiteMs}
      compacta={compacta}
      resaltado={resaltado}
      nombreEstacion={nombreEstacion}
      onItem={tocarItem}
      onPedido={avanzarPedido}
    />
  );
  const vacio = (texto: string) => (
    <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
      {texto}
    </p>
  );
  const control =
    'inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-app px-3 text-sm font-semibold hover:bg-surface';

  return (
    <div className="tema-operacion flex min-h-dvh flex-col lg:h-dvh">
      <Encabezado
        titulo="Cocina y bar"
        debajo={
          pendienteAhora.length > 0 && (
            <div className="flex items-center gap-2 border-t border-line px-3 py-2">
              <span className="shrink-0 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
                Pendiente ahora
              </span>
              <div className="flex gap-1.5 overflow-x-auto">
                {pendienteAhora.map(([nombre, cantidad]) => (
                  <button
                    key={nombre}
                    type="button"
                    aria-pressed={resaltado === nombre}
                    onClick={() => setResaltado((r) => (r === nombre ? null : nombre))}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold whitespace-nowrap ${
                      resaltado === nombre
                        ? 'border-info bg-info-soft text-fg'
                        : 'border-line bg-app hover:bg-surface'
                    }`}
                  >
                    <span className="font-display font-extrabold text-amber tabular-nums">
                      {cantidad}
                    </span>
                    {nombre}
                  </button>
                ))}
              </div>
            </div>
          )
        }
      >
        <Kpi texto="nuevos" valor={nuevos.length} />
        <Kpi texto="en preparación" valor={enPrep.length} />
        <Kpi texto="listos" valor={listos.length} />
        <Kpi texto="atrasados" valor={atrasados.length} alerta={atrasados.length > 0} />
        <Kpi
          texto="espera prom."
          valor={enCurso.length ? tiempoTranscurrido(esperaPromedio) : '—'}
        />
        <label className="flex h-10 w-44 items-center gap-2 rounded-[10px] bg-app px-3">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Buscar mesa o pedido</span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Mesa o pedido"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {estaciones.length > 1 && (
          <Segmentado
            etiqueta="Estación"
            valor={filtroValido}
            onCambio={setFiltro}
            opciones={[{ id: TODAS, nombre: 'Todas' }, ...estaciones].map((e) => ({
              id: e.id,
              texto: e.nombre,
              cantidad: pendientesDe(e.id),
            }))}
          />
        )}
        <button
          type="button"
          aria-pressed={compacta}
          onClick={() => setCompacta((c) => !c)}
          className={control}
        >
          {compacta ? (
            <LayoutGrid className="size-4" aria-hidden />
          ) : (
            <Rows3 className="size-4" aria-hidden />
          )}
          {compacta ? 'Vista normal' : 'Vista compacta'}
        </button>
        <label className={control}>
          <span className="text-muted">Atraso</span>
          <select
            value={limiteMin}
            onChange={(e) => setLimiteMin(Number(e.target.value))}
            aria-label="Minutos para considerar un pedido atrasado"
            className="bg-transparent font-semibold outline-none"
          >
            {LIMITES.map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={verAgotados}
          onClick={() => {
            setVerAgotados((v) => !v);
            cargarPlatos();
          }}
          className={control}
        >
          <Ban className="size-4" aria-hidden /> Agotados
        </button>
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>

      {error && (
        <p role="alert" className="mx-3 mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}. Se vuelve a sincronizar solo; si sigue, revise la conexión.
        </p>
      )}

      {verAgotados && (
        <section className="mx-3 mt-3 rounded-xl border border-line bg-app p-4">
          <h2 className="font-display text-lg font-extrabold">Marcar platos agotados</h2>
          <p className="mb-3 text-sm text-muted">Los agotados dejan de poder pedirse en el menú.</p>
          <div className="flex flex-wrap gap-2">
            {platos
              .filter((p) => p.activo && (filtroValido === TODAS || p.estacionId === filtroValido))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => alternarAgotado(p)}
                  aria-pressed={p.agotado}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
                    p.agotado ? 'bg-danger text-bg' : 'bg-surface hover:bg-surface-2'
                  }`}
                >
                  {p.agotado ? 'Agotado · ' : ''}
                  {p.nombreEs}
                </button>
              ))}
          </div>
        </section>
      )}

      {olvidados.length > 0 && (
        <section
          role="alert"
          className="mx-3 mt-3 flex flex-col gap-1.5 rounded-xl border-2 border-danger bg-danger-soft p-3"
        >
          {olvidados.map((p) => (
            <p key={p.pedidoId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1">
                <strong>{nombreDe(p)}</strong> lleva{' '}
                {/* Más de 2 h en Listos: ese tiempo; si no, el total desde que se pidió. */}
                {p.columna === 'listos' && (p.listoHace ?? 0) > OLVIDADO_MS ? (
                  <>
                    <strong className="tabular-nums">{tiempoTranscurrido(p.listoHace!)}</strong> en
                    Listos
                  </>
                ) : (
                  <>
                    <strong className="tabular-nums">{tiempoTranscurrido(p.edad)}</strong> desde que
                    se pidió (
                    {p.columna === 'listos'
                      ? 'está en Listos'
                      : p.columna === 'prep'
                        ? 'en preparación'
                        : 'sin empezar'}
                    )
                  </>
                )}
                . Lo sacamos de la cola para que no tape lo urgente.
              </span>
              <button
                type="button"
                onClick={() => avanzarPedido(p, 'ENTREGADO')}
                className="min-h-11 rounded-[10px] bg-danger px-3 text-sm font-bold text-bg"
              >
                Marcar como entregado
              </button>
            </p>
          ))}
        </section>
      )}

      <main className="flex flex-1 flex-wrap gap-3 p-3 lg:min-h-0 lg:flex-nowrap">
        <ColumnaTablero
          titulo="NUEVOS"
          punto="bg-info"
          cantidad={nuevos.length}
          pista="Más antiguos primero"
          className="w-full lg:w-auto lg:flex-[1_1_0]"
        >
          {nuevos.filter(coincide).length === 0 ? (
            vacio(q ? 'Nada coincide con la búsqueda' : 'Sin pedidos nuevos')
          ) : (
            <div className={grid}>
              {nuevos
                .filter(coincide)
                .sort((a, b) => b.edad - a.edad)
                .map(tarjeta)}
            </div>
          )}
        </ColumnaTablero>
        <ColumnaTablero
          titulo="EN PREPARACIÓN"
          punto="bg-amber"
          cantidad={enPrep.length}
          pista="Toca cada plato al terminarlo"
          className="w-full lg:w-auto lg:flex-[2.4_1_0]"
        >
          {enPrep.filter(coincide).length === 0 ? (
            vacio(q ? 'Nada coincide con la búsqueda' : 'Nada en preparación')
          ) : (
            <div className={grid}>
              {enPrep
                .filter(coincide)
                .sort((a, b) => Number(b.atrasado) - Number(a.atrasado) || b.edad - a.edad)
                .map(tarjeta)}
            </div>
          )}
        </ColumnaTablero>
        <ColumnaTablero
          titulo="LISTOS PARA ENTREGAR"
          punto="bg-ok"
          cantidad={listos.length}
          pista="El que más espera arriba"
          className="w-full lg:w-[300px] lg:flex-none"
        >
          {listos.filter(coincide).length === 0 ? (
            vacio('Nada esperando')
          ) : (
            <ul className="flex flex-col gap-2">
              {listos
                .filter(coincide)
                .sort((a, b) => (b.listoHace ?? 0) - (a.listoHace ?? 0))
                .map((p) => {
                  const esperando = (p.listoHace ?? 0) > ESPERA_LISTO_MS;
                  return (
                    <li key={p.pedidoId} className="rounded-xl border border-line bg-app p-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-lg font-extrabold">{nombreDe(p)}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${CANAL[p.canal].clase}`}
                        >
                          {CANAL[p.canal].texto}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {p.items.map((i) => `${i.cantidad}× ${i.nombreEs}`).join(' · ')}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold tabular-nums ${esperando ? 'text-amber' : 'text-ok'}`}
                        >
                          {esperando ? 'Esperando hace' : 'Listo hace'}{' '}
                          {tiempoTranscurrido(p.listoHace ?? 0)}
                        </span>
                        <button
                          type="button"
                          onClick={() => avanzarPedido(p, 'ENTREGADO')}
                          className="min-h-11 rounded-[10px] bg-ok px-4 text-sm font-bold text-bg"
                        >
                          Entregado
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </ColumnaTablero>
      </main>

      {deshacible && (
        <div
          role="status"
          className="anim-aparecer fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-[14px] bg-fg py-2 pr-2 pl-4 text-bg shadow-app"
        >
          <span className="text-sm font-semibold">
            {deshacible.lugar} · {deshacible.item.nombreEs} →{' '}
            {deshacible.estado === 'LISTO' ? 'Listo' : 'En preparación'}
          </span>
          <button
            type="button"
            onClick={deshacer}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-amber px-3 text-sm font-bold text-bg"
          >
            <Undo2 className="size-4" aria-hidden /> Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
