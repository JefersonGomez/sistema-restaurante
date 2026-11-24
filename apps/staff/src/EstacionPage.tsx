import { Ban, Check, CheckCheck, Ellipsis, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  avisoAgrupado,
  type EstadoItem,
  type ItemDetalle,
  type PedidoEstacion,
} from '@menu-qr/shared';
import { apiOEncolar, esSinRed, leerConFoto } from './sinConexion';
import { api } from './api';
import { avisar } from './avisos';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { BotonSonido, Conexion, Encabezado, hora, Segmentado } from './ui';

// Cocina y bar en comandas (Fase 20.1), como los sistemas de cocina de Square, Toast o Loyverse:
// una tarjeta por pedido, la más vieja primero, y un solo toque ("Listo") para despacharla.
// Solo el botón "Listo" marca (el usuario no quiere que tocar un plato lo marque). El color solo
// está en la franja del tiempo.
const LIMITES = [10, 15, 20, 30]; // minutos para considerar un pedido atrasado
const OLVIDADO_MS = 2 * 60 * 60_000; // más de 2 h: se esconde para no tapar lo urgente
const DESHACER_MS = 8000; // el servidor acepta deshacer hasta 15 s
const TODAS = 'todas';

type Estacion = { id: string; nombre: string };
type Plato = {
  id: string;
  nombreEs: string;
  agotado: boolean;
  activo: boolean;
  estacionId: string;
};
type Despachado = { lugar: string; ids: string[] };

// Preferencias del dispositivo (estación, letra, límite); sin almacenamiento, los valores por defecto.
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

const nombreDe = (p: PedidoEstacion) =>
  p.canal === 'MESA'
    ? p.lugar
    : `${p.canal === 'RECOGER' ? 'Llevar' : 'Domicilio'} #${p.numero ?? ''}`;
const hecho = (i: ItemDetalle) => i.estado === 'LISTO' || i.estado === 'ENTREGADO';
// "sin cebolla", "extra queso"…: cambios que la cocina no puede pasar por alto.
const CAMBIO = /^(sin|extra|con|más|mas|poco|doble|aparte)\b/i;

function Comanda({
  p,
  edad,
  limiteMs,
  grande,
  estacionDe,
  onListo,
}: {
  p: PedidoEstacion;
  edad: number;
  limiteMs: number;
  grande: boolean;
  estacionDe: (i: ItemDetalle) => string | null;
  onListo: () => void;
}) {
  // Franja del tiempo: neutra, ámbar al acercarse al límite y roja solo al pasarse.
  // Tiempo: neutro, ámbar al acercarse al límite y rojo solo al pasarse. El color va en una línea
  // fina arriba y en la píldora del tiempo; la tarjeta no se pinta entera.
  const [linea, pildora] =
    edad > limiteMs
      ? ['border-t-danger', 'bg-danger text-bg']
      : edad > limiteMs * 0.7
        ? ['border-t-amber', 'bg-amber text-bg']
        : ['border-t-line', 'bg-surface-2 text-fg'];
  const texto = grande ? 'text-2xl' : 'text-lg';
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl border border-t-4 border-line bg-app ${linea}`}
    >
      <header className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <h2 className={`font-display font-extrabold ${grande ? 'text-3xl' : 'text-2xl'}`}>
          {nombreDe(p)}
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 font-bold tabular-nums ${pildora} ${grande ? 'text-lg' : 'text-sm'}`}
        >
          {Math.floor(edad / 60_000)} min
        </span>
      </header>
      <p className="px-3.5 pt-1.5 text-xs text-muted">
        {p.canal === 'RECOGER' ? 'Para llevar · ' : p.canal === 'DOMICILIO' ? 'A domicilio · ' : ''}
        {hora(p.confirmadoEn)}
        {p.atendio && ` · ${p.atendio}`}
      </p>
      {p.nota && (
        <p className="mx-3 mt-2 rounded-md bg-amber-soft px-3 py-2 text-sm font-semibold text-amber-ink">
          {p.nota}
        </p>
      )}
      <ul className="flex flex-1 flex-col px-1.5 py-1.5">
        {p.items.map((i) => {
          const listo = hecho(i);
          const estacion = estacionDe(i);
          return (
            <li key={i.id}>
              <div className="flex min-h-12 w-full items-start gap-2.5 px-2 py-1.5">
                <span
                  className={`${texto} w-9 shrink-0 text-right font-extrabold tabular-nums ${listo ? 'text-muted' : ''}`}
                >
                  {i.cantidad}×
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`${texto} block leading-snug font-semibold ${listo ? 'text-muted line-through' : ''}`}
                  >
                    {i.nombreEs}
                    {estacion && (
                      <span className="ml-2 align-middle text-xs font-bold text-teal">
                        {estacion.toUpperCase()}
                      </span>
                    )}
                  </span>
                  {!listo &&
                    i.modificadores.map((m) => (
                      <span
                        key={m.nombre}
                        className={`block font-semibold ${grande ? 'text-lg' : 'text-base'} ${CAMBIO.test(m.nombre) ? 'text-amber' : 'text-fg'}`}
                      >
                        {m.nombre}
                      </span>
                    ))}
                  {!listo && i.notas && (
                    <span
                      className={`mt-1 block rounded-md px-2 py-1 text-sm font-semibold ${
                        /alerg/i.test(i.notas)
                          ? 'bg-danger text-bg'
                          : 'bg-amber-soft text-amber-ink'
                      }`}
                    >
                      {i.notas}
                    </span>
                  )}
                </span>
                {listo && <Check className="mt-1 size-5 shrink-0 text-ok" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onListo}
        className={`m-2 mt-0 inline-flex items-center justify-center gap-2 rounded-lg bg-ok font-bold text-on-accent ${grande ? 'h-16 text-xl' : 'h-14 text-lg'}`}
      >
        <Check className="size-5" aria-hidden /> Listo
      </button>
    </article>
  );
}

export function EstacionPage() {
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [filtro, setFiltro] = useState<string>(() => leer('staff-estacion') ?? TODAS);
  const [pedidos, setPedidos] = useState<PedidoEstacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const [grande, setGrande] = useState(() => leer('kds-letra') === 'grande');
  const [limiteMin, setLimiteMin] = useState(() => Number(leer('kds-limite')) || 15);
  const [verAgotados, setVerAgotados] = useState(false);
  const [verViejos, setVerViejos] = useState(false);
  const [platos, setPlatos] = useState<Plato[]>([]);
  useWakeLock();

  useEffect(() => {
    leerConFoto<Estacion[]>('/operacion/estaciones', true).then(setEstaciones, (e: Error) =>
      setError(e.message),
    );
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, []);
  useEffect(() => guardar('staff-estacion', filtro), [filtro]);
  useEffect(() => guardar('kds-letra', grande ? 'grande' : 'normal'), [grande]);
  useEffect(() => guardar('kds-limite', String(limiteMin)), [limiteMin]);

  // Se cargan todas las estaciones visibles y se filtra en pantalla.
  const conDatos = useRef(false);
  const cargar = useCallback(async () => {
    if (estaciones.length === 0) return;
    try {
      const listas = await Promise.all(
        estaciones.map((e) =>
          leerConFoto<PedidoEstacion[]>(`/operacion/estaciones/${e.id}/items`, !conDatos.current),
        ),
      );
      conDatos.current = true;
      // Un pedido con platos de cocina y de bar llega dos veces: se junta en una comanda.
      const porPedido = new Map<string, PedidoEstacion>();
      for (const p of listas.flat()) {
        const previo = porPedido.get(p.pedidoId);
        porPedido.set(p.pedidoId, previo ? { ...previo, items: [...previo.items, ...p.items] } : p);
      }
      setPedidos([...porPedido.values()]);
      setError(null);
    } catch (e) {
      // Sin internet lo dice el aviso de abajo; la pantalla sigue con lo que tenía.
      if (!esSinRed(e)) setError((e as Error).message);
    }
  }, [estaciones]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarPlatos = useCallback(async () => {
    setPlatos(await leerConFoto<Plato[]>('/platos', true).catch(() => []));
  }, []);
  const refrescar = useRefrescoAgrupado(cargar);
  const conectado = useTiempoReal(
    {
      'pedido:confirmado': refrescar, // el aviso con sonido lo da AvisosGlobales
      'item:estado': refrescar,
      'pedido:cancelado': refrescar,
      'pedido:listo': refrescar,
      'cuenta:cerrada': refrescar,
      'menu:actualizado': () => verAgotados && cargarPlatos(),
    },
    cargar,
  );

  const filtroValido = filtro === TODAS || estaciones.some((e) => e.id === filtro) ? filtro : TODAS;
  // La estación principal no lleva etiqueta: la que se llama "Cocina" (o la primera).
  const principal = (estaciones.find((e) => /cocina/i.test(e.nombre)) ?? estaciones[0])?.id;
  const estacionDe = (i: ItemDetalle) =>
    filtroValido === TODAS && estaciones.length > 1 && i.estacionId !== principal
      ? (estaciones.find((e) => e.id === i.estacionId)?.nombre ?? null)
      : null;
  const limiteMs = limiteMin * 60_000;
  const edadDe = (p: PedidoEstacion) => ahora - Date.parse(p.confirmadoEn);

  // Comandas con algo por hacer en la estación elegida, la más vieja primero.
  const deEstacion = (estacion: string) =>
    pedidos
      .map((p) => ({
        ...p,
        items: p.items.filter((i) => estacion === TODAS || i.estacionId === estacion),
      }))
      .filter((p) => p.items.length > 0 && !p.items.every(hecho))
      .sort((a, b) => Date.parse(a.confirmadoEn) - Date.parse(b.confirmadoEn));
  const comandas = deEstacion(filtroValido);
  const viejas = comandas.filter((p) => edadDe(p) > OLVIDADO_MS);
  const enCola = comandas.filter((p) => edadDe(p) <= OLVIDADO_MS);
  const atrasadas = enCola.filter((p) => edadDe(p) > limiteMs);

  // Aviso cuando un pedido pasa a atrasado.
  const yaAvisados = useRef(new Set<string>());
  const claveAtrasadas = atrasadas.map((p) => p.pedidoId).join(',');
  useEffect(() => {
    avisoAgrupado(yaAvisados.current, claveAtrasadas ? claveAtrasadas.split(',') : [], (n) =>
      avisar('cocina', n === 1 ? 'Un pedido está atrasado' : `${n} pedidos están atrasados`),
    );
  }, [claveAtrasadas]);

  // "Deshacer" del último despacho, visible DESHACER_MS.
  const [despachado, setDespachado] = useState<Despachado | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const fijar = (ids: string[], estado: EstadoItem) =>
    setPedidos((ps) =>
      ps.map((p) => ({
        ...p,
        items: p.items.map((i) => (ids.includes(i.id) ? { ...i, estado } : i)),
      })),
    );
  const llamar = async (fn: () => Promise<unknown>) => {
    await fn().catch((e: Error) => !esSinRed(e) && setError(e.message));
    refrescar();
  };

  // Marca listos los platos; si con eso queda todo el pedido listo, avisa al mesero.
  const marcarListos = (p: PedidoEstacion, ids: string[]) => {
    const completo = pedidos
      .find((x) => x.pedidoId === p.pedidoId)
      ?.items.every((i) => hecho(i) || ids.includes(i.id));
    fijar(ids, 'LISTO');
    if (completo) {
      clearTimeout(temporizador.current);
      setDespachado({ lugar: nombreDe(p), ids });
      temporizador.current = setTimeout(() => setDespachado(null), DESHACER_MS);
    }
    llamar(async () => {
      await apiOEncolar(`/operacion/pedidos/${p.pedidoId}/avanzar`, {
        method: 'POST',
        body: { estado: 'LISTO', itemIds: ids },
      });
      if (completo)
        await apiOEncolar(`/operacion/pedidos/${p.pedidoId}/avisar-listo`, { method: 'POST' });
    });
  };
  const listo = (p: PedidoEstacion) =>
    marcarListos(
      p,
      p.items.filter((i) => !hecho(i)).map((i) => i.id),
    );
  const deshacer = () => {
    if (!despachado) return;
    const { ids } = despachado;
    setDespachado(null);
    fijar(ids, 'EN_PREPARACION');
    llamar(() =>
      Promise.all(
        ids.map((id) =>
          apiOEncolar(`/operacion/items/${id}/deshacer`, {
            method: 'POST',
            body: { estado: 'LISTO' },
          }),
        ),
      ),
    );
  };

  const alternarAgotado = async (p: Plato) => {
    await api(`/platos/${p.id}/agotado`, { method: 'PATCH', body: { agotado: !p.agotado } }).catch(
      () => {},
    );
    cargarPlatos();
  };

  const opcion =
    'flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-sm hover:bg-surface-2';
  const mostradas = verViejos ? [...enCola, ...viejas] : enCola;

  return (
    <div className="tema-operacion min-h-dvh">
      <Encabezado titulo="Cocina">
        <span className="rounded-full bg-app px-3 py-1.5 text-sm font-semibold tabular-nums">
          {enCola.length} {enCola.length === 1 ? 'pedido' : 'pedidos'}
        </span>
        {estaciones.length > 1 && (
          <Segmentado
            etiqueta="Estación"
            valor={filtroValido}
            onCambio={setFiltro}
            opciones={[{ id: TODAS, nombre: 'Todas' }, ...estaciones].map((e) => ({
              id: e.id,
              texto: e.nombre,
              cantidad: deEstacion(e.id).filter((p) => edadDe(p) <= OLVIDADO_MS).length,
            }))}
          />
        )}
        <BotonSonido />
        <Conexion conectado={conectado} />
        <details className="relative">
          <summary
            className="grid size-10 cursor-pointer list-none place-items-center rounded-[10px] bg-app hover:bg-surface"
            aria-label="Opciones de la cocina"
          >
            <Ellipsis className="size-5" aria-hidden />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-line bg-app p-1.5 shadow-app">
            <button
              type="button"
              className={opcion}
              onClick={() => {
                setVerAgotados((v) => !v);
                cargarPlatos();
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Ban className="size-4" aria-hidden /> Platos agotados
              </span>
              <span className="text-muted">{verAgotados ? 'Ocultar' : 'Ver'}</span>
            </button>
            <button type="button" className={opcion} onClick={() => setGrande((g) => !g)}>
              Letra grande
              <span className="text-muted">{grande ? 'Sí' : 'No'}</span>
            </button>
            <label className={opcion}>
              Atrasado después de
              <select
                value={limiteMin}
                onChange={(e) => setLimiteMin(Number(e.target.value))}
                className="bg-transparent font-semibold outline-none"
              >
                {LIMITES.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </Encabezado>

      {error && (
        <p role="alert" className="mx-3 mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}. Se vuelve a sincronizar solo; si sigue, revise la conexión.
        </p>
      )}

      {verAgotados && (
        <section className="mx-3 mt-3 rounded-xl border border-line bg-app p-4">
          <h2 className="font-display text-lg font-extrabold">Platos agotados</h2>
          <p className="mb-3 text-sm text-muted">
            Toque un plato para marcarlo agotado: deja de poder pedirse en el menú.
          </p>
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

      <main className="p-3">
        {mostradas.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center text-muted">
            <CheckCheck className="size-12" aria-hidden />
            <p className="text-lg font-semibold text-fg">Todo al día</p>
            <p className="text-sm">Los pedidos nuevos aparecen aquí solos.</p>
          </div>
        ) : (
          <div
            className={`grid items-start gap-3 ${grande ? '[grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]' : '[grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr))]'}`}
          >
            {mostradas.map((p) => (
              <Comanda
                key={p.pedidoId}
                p={p}
                edad={edadDe(p)}
                limiteMs={limiteMs}
                grande={grande}
                estacionDe={estacionDe}
                onListo={() => listo(p)}
              />
            ))}
          </div>
        )}
        {viejas.length > 0 && (
          <p className="mt-4 text-center text-sm text-muted">
            {viejas.length} {viejas.length === 1 ? 'pedido' : 'pedidos'} de hace más de 2 horas.{' '}
            <button
              type="button"
              onClick={() => setVerViejos((v) => !v)}
              className="min-h-11 font-semibold text-fg underline underline-offset-2"
            >
              {verViejos ? 'Ocultar' : 'Ver'}
            </button>
          </p>
        )}
      </main>

      {despachado && (
        <div
          role="status"
          className="anim-aparecer fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-[14px] bg-fg py-2 pr-2 pl-4 text-bg shadow-app"
        >
          <span className="text-sm font-semibold">{despachado.lugar} listo</span>
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
