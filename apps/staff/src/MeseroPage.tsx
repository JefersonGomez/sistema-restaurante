import { Bell, CheckCheck, ClipboardList, ReceiptText, Users, Utensils } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  CuentaDetalle,
  EstadoMesa,
  ItemDetalle,
  MenuPublico,
  MesaOperacion,
  PedidoDetalle,
} from '@menu-qr/shared';
import { avisoAgrupado } from '@menu-qr/shared';
import { IconoMesa } from '@menu-qr/ui';
import { avisar } from './avisos';
import { apiOEncolar, esSinRed, leerConFoto } from './sinConexion';
import { obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { MesaDetalle } from './MesaDetalle';
import { TomarPedido } from './TomarPedido';
import { BotonSonido, Conexion, Encabezado, formatoPrecio, hora } from './ui';
import { pedirMotivo } from './dialogos';

type PedidoPendiente = PedidoDetalle & {
  cuentaId: string;
  mesa: { numero: number; nombre: string | null };
};
type ItemListo = ItemDetalle & { pedidoId: string; mesa: { numero: number } };
type Llamada = {
  id: string;
  tipo: 'MESERO' | 'CUENTA';
  createdAt: string;
  mesa: { numero: number };
};

// Plato listo que espera más de esto sin entregarse → verde animado y aviso al mesero.
const LISTO_ESPERA_MIN = 5;

const COLOR_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'bg-surface border-transparent text-muted',
  OCUPADA: 'bg-purple-soft border-transparent text-purple',
  PEDIDO_PENDIENTE: 'bg-amber-soft border-amber text-amber-ink',
  PIDIO_CUENTA: 'bg-app border-purple text-purple',
  LLAMADA: 'bg-danger-soft border-danger text-danger',
};
const TEXTO_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  PEDIDO_PENDIENTE: 'Por confirmar',
  PIDIO_CUENTA: 'Pidió la cuenta',
  LLAMADA: 'Llamando',
};

// Insignia sobre la tarjeta de la mesa: ícono + texto (nunca solo color).
function Insignia({ icono, texto, tono }: { icono: ReactNode; texto: string; tono: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tono}`}
    >
      {icono}
      {texto}
    </span>
  );
}

// "12 min", "3 h", "2 días": cuánto lleva esperando.
const haceCuanto = (ms: number) => {
  const min = Math.floor(ms / 60_000);
  return min < 60
    ? `${min} min`
    : min < 1440
      ? `${Math.floor(min / 60)} h`
      : `${Math.floor(min / 1440)} días`;
};
// Platos iguales (mismo nombre y opciones) en un solo renglón: "4× Empanadas de queso".
const juntarIguales = (items: ItemListo[]) => {
  const suma = new Map<string, number>();
  for (const i of items) {
    const texto = i.modificadores.length
      ? `${i.nombreEs} (${i.modificadores.map((m) => m.nombre).join(', ')})`
      : i.nombreEs;
    suma.set(texto, (suma.get(texto) ?? 0) + i.cantidad);
  }
  return [...suma];
};

// Una entrada de "Ahora": llamadas, pedidos por confirmar y platos listos (juntos por mesa).
type Entrada =
  | { tipo: 'llamada'; fecha: string; llamada: Llamada }
  | { tipo: 'pedido'; fecha: string; pedido: PedidoPendiente }
  | { tipo: 'listo'; fecha: string; mesa: number; items: ItemListo[] };

export function MeseroPage() {
  const { usuario } = useAuth();
  const [mesas, setMesas] = useState<MesaOperacion[]>([]);
  const [pendientes, setPendientes] = useState<PedidoPendiente[]>([]);
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [listos, setListos] = useState<ItemListo[]>([]);
  const [cargado, setCargado] = useState(false);
  const [mesaAbierta, setMesaAbierta] = useState<MesaOperacion | null>(null);
  const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
  const [tomando, setTomando] = useState<MesaOperacion | null>(null);
  const [menu, setMenu] = useState<MenuPublico>();
  const [ahora, setAhora] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const slug = usuario?.restaurante?.slug ?? '';

  useEffect(() => {
    if (slug) obtenerMenu(slug).then(setMenu, () => {});
  }, [slug]);
  const precio = formatoPrecio(menu?.restaurante.moneda ?? 'CRC');

  const conDatos = useRef(false);
  const cargar = useCallback(async () => {
    try {
      const foto = !conDatos.current;
      const [m, p, l, i] = await Promise.all([
        leerConFoto<MesaOperacion[]>('/operacion/mesas', foto),
        leerConFoto<PedidoPendiente[]>('/operacion/pedidos?estado=PENDIENTE', foto),
        leerConFoto<Llamada[]>('/operacion/llamadas?atendida=false', foto),
        leerConFoto<ItemListo[]>('/operacion/items?estado=LISTO', foto),
      ]);
      conDatos.current = true;
      setMesas(m);
      setPendientes(p);
      setLlamadas(l);
      setListos(i);
      setError(null);
      setCargado(true);
    } catch (e) {
      // Sin internet lo dice el aviso de abajo; la pantalla sigue con lo que tenía.
      if (!esSinRed(e)) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, [cargar]);

  const cargarCuenta = useCallback(async (id: string | undefined) => {
    if (!id) return setCuenta(null);
    try {
      setCuenta(await leerConFoto<CuentaDetalle>(`/operacion/cuentas/${id}`, true));
    } catch (e) {
      if (!esSinRed(e)) setCuenta(null);
    }
  }, []);

  const refrescar = useRefrescoAgrupado(() => {
    cargar();
    if (mesaAbierta) cargarCuenta(mesaAbierta.cuenta?.id);
  });
  // El sonido y la vibración los da AvisosGlobales (en cualquier pantalla); aquí solo se refresca.
  const alerta = refrescar;
  const conectado = useTiempoReal(
    {
      'pedido:nuevo': alerta,
      'mesa:llamada': alerta,
      'cuenta:solicitada': alerta,
      'item:estado': (p: { estado: string }) => (p.estado === 'LISTO' ? alerta() : refrescar()),
      'pedido:confirmado': refrescar,
      'pedido:listo': refrescar, // cocina avisó (el sonido lo da AvisosGlobales)
      'pedido:cancelado': refrescar,
      'cuenta:cerrada': refrescar,
      'llamada:atendida': refrescar,
    },
    cargar,
  );

  const accion = async (ruta: string, body?: unknown, method = 'PATCH') => {
    const r = await apiOEncolar(ruta, { method, body }).catch((e: Error) => {
      // Sin red y no se puede guardar (cancelar, por ejemplo): se avisa.
      setError(
        esSinRed(e) ? 'Esto necesita internet. Inténtelo cuando vuelva la conexión.' : e.message,
      );
      return null;
    });
    // Guardada sin conexión: se quita de la lista ya, para que no se vuelva a tocar.
    if (r?.encolada) {
      const id = ruta.split('/')[3];
      if (ruta.endsWith('/atender')) setLlamadas((ls) => ls.filter((l) => l.id !== id));
      if (ruta.endsWith('/confirmar')) setPendientes((ps) => ps.filter((p) => p.id !== id));
      if (ruta.endsWith('/estado')) setListos((is) => is.filter((i) => i.id !== id));
    }
    refrescar();
    return !!r?.encolada;
  };

  const abrirMesa = (m: MesaOperacion) => {
    setMesaAbierta(m);
    cargarCuenta(m.cuenta?.id);
  };

  // Platos listos esperando a ser llevados (updatedAt = cuándo quedó listo).
  const esperando = listos
    .filter((i) => ahora - new Date(i.updatedAt).getTime() >= LISTO_ESPERA_MIN * 60_000)
    .map((i) => i.id);
  const yaAvisados = useRef(new Set<string>());
  const claveEsperando = esperando.join(',');
  useEffect(() => {
    avisoAgrupado(yaAvisados.current, claveEsperando ? claveEsperando.split(',') : [], (n) =>
      avisar(
        'listo',
        n === 1
          ? `Un plato listo espera más de ${LISTO_ESPERA_MIN} min para llevarse`
          : `${n} platos listos esperan más de ${LISTO_ESPERA_MIN} min para llevarse`,
      ),
    );
  }, [claveEsperando]);

  // Lo más urgente primero (Fase 20.5): llamadas, pedidos por confirmar y platos listos por mesa;
  // dentro de cada grupo, lo más antiguo primero.
  const porFecha = <T extends { fecha: string }>(xs: T[]) =>
    xs.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const listosPorMesa = new Map<number, ItemListo[]>();
  for (const i of listos)
    listosPorMesa.set(i.mesa.numero, [...(listosPorMesa.get(i.mesa.numero) ?? []), i]);
  const bandeja: Entrada[] = [
    ...porFecha(
      llamadas.map((l) => ({ tipo: 'llamada' as const, fecha: l.createdAt, llamada: l })),
    ),
    ...porFecha(
      pendientes.map((p) => ({ tipo: 'pedido' as const, fecha: p.createdAt, pedido: p })),
    ),
    ...porFecha(
      [...listosPorMesa].map(([mesa, items]) => ({
        tipo: 'listo' as const,
        fecha: items.reduce((f, i) => (i.updatedAt < f ? i.updatedAt : f), items[0]!.updatedAt),
        mesa,
        items,
      })),
    ),
  ];
  const servirTodos = async (items: ItemListo[]) => {
    for (const i of items) await accion(`/operacion/items/${i.id}/estado`, { estado: 'ENTREGADO' });
  };

  const porMesa = (n: number) => ({
    pedidos: pendientes.filter((p) => p.mesa.numero === n).length,
    llamadas: llamadas.filter((l) => l.mesa.numero === n && l.tipo === 'MESERO').length,
    cuenta: llamadas.some((l) => l.mesa.numero === n && l.tipo === 'CUENTA'),
    listos: listos.filter((i) => i.mesa.numero === n).length,
  });

  const botonPrincipal =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent';
  const botonSuave =
    'inline-flex min-h-11 items-center justify-center rounded-md bg-surface px-4 text-sm font-medium hover:bg-surface-2';

  return (
    <div className="tema-operacion min-h-dvh pb-6">
      <Encabezado titulo="Meseros">
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>

      {error && (
        <p role="alert" className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}. Se vuelve a sincronizar solo; si sigue, revise la conexión.
        </p>
      )}

      {/* Una sola pantalla (Fase 20.5): las mesas y, al lado (abajo en el celular, arriba), lo
          urgente: llamadas, pedidos por confirmar y platos listos para servir. */}
      <div className="mx-auto grid max-w-6xl gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <main
          aria-label="Mesas"
          className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 xl:grid-cols-4"
        >
          {!cargado &&
            Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="esqueleto aspect-[4/3] rounded-lg" aria-hidden />
            ))}
          {cargado && mesas.length === 0 && (
            <p className="col-span-full p-8 text-center text-muted">
              No hay mesas activas. El dueño las crea en Panel → Mesas y QR.
            </p>
          )}
          {mesas.map((m) => {
            const b = porMesa(m.numero);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => abrirMesa(m)}
                aria-label={`Mesa ${m.numero}: ${TEXTO_MESA[m.estado]}`}
                className={`anim-entrar flex min-h-28 flex-col items-start gap-1 rounded-lg border-2 p-3 text-left hover:-translate-y-0.5 hover:shadow-app ${COLOR_MESA[m.estado]}`}
              >
                <span className="flex w-full items-baseline justify-between">
                  <span className="flex items-center gap-2">
                    <IconoMesa className="size-7 opacity-80" />
                    <span className="text-3xl font-bold text-fg">{m.numero}</span>
                  </span>
                  {m.cuenta && (
                    <span className="text-xs text-muted tabular-nums">
                      {precio(m.cuenta.total)}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {TEXTO_MESA[m.estado]}
                  {m.cuenta?.personas && (
                    <span className="inline-flex items-center gap-0.5 font-normal text-muted">
                      · <Users className="size-3" aria-hidden /> {m.cuenta.personas}
                    </span>
                  )}
                </span>
                <span className="mt-auto flex flex-wrap gap-1">
                  {b.pedidos > 0 && (
                    <Insignia
                      tono="bg-amber text-on-amber"
                      icono={<ClipboardList className="size-3" aria-hidden />}
                      texto={`${b.pedidos} por confirmar`}
                    />
                  )}
                  {b.llamadas > 0 && (
                    <Insignia
                      tono="bg-danger text-on-accent"
                      icono={<Bell className="size-3" aria-hidden />}
                      texto="Llama"
                    />
                  )}
                  {(b.cuenta || m.estado === 'PIDIO_CUENTA') && (
                    <Insignia
                      tono="bg-purple text-on-accent"
                      icono={<ReceiptText className="size-3" aria-hidden />}
                      texto="Cuenta"
                    />
                  )}
                  {b.listos > 0 && (
                    <Insignia
                      tono="bg-ok text-on-accent"
                      icono={<Utensils className="size-3" aria-hidden />}
                      texto={`${b.listos} listo${b.listos > 1 ? 's' : ''}`}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </main>

        <aside
          aria-label="Ahora"
          className="order-first space-y-2 lg:sticky lg:top-24 lg:order-last"
        >
          <h2 className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">
            Ahora
            {bandeja.length > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1.5 text-xs font-bold text-on-amber">
                {bandeja.length}
              </span>
            )}
          </h2>
          {bandeja.length === 0 && (
            <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
              Nada pendiente. Las llamadas y los platos listos aparecen aquí.
            </p>
          )}
          {bandeja.map((e) =>
            e.tipo === 'llamada' ? (
              <article
                key={e.llamada.id}
                className="anim-entrar flex items-center gap-3 rounded-lg border-l-4 border-danger bg-app p-3 shadow-tarjeta"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                  {e.llamada.tipo === 'CUENTA' ? (
                    <ReceiptText className="size-5" aria-hidden />
                  ) : (
                    <Bell className="size-5" aria-hidden />
                  )}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">
                    Mesa {e.llamada.mesa.numero} ·{' '}
                    {e.llamada.tipo === 'CUENTA' ? 'pide la cuenta' : 'llama al mesero'}
                  </p>
                  <p className="text-xs text-muted">{hora(e.fecha)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => accion(`/operacion/llamadas/${e.llamada.id}/atender`)}
                  className={botonPrincipal}
                >
                  Atendida
                </button>
              </article>
            ) : e.tipo === 'pedido' ? (
              <article
                key={e.pedido.id}
                className="anim-entrar rounded-lg border-l-4 border-amber bg-app p-3 shadow-tarjeta"
              >
                <p className="font-semibold">
                  Mesa {e.pedido.mesa.numero} · pedido por confirmar
                  <span className="ml-2 text-xs font-normal text-muted">{hora(e.fecha)}</span>
                </p>
                <ul className="my-2 space-y-0.5 text-sm">
                  {e.pedido.items.map((i) => (
                    <li key={i.id}>
                      <span className="font-medium tabular-nums">{i.cantidad}×</span> {i.nombreEs}
                      {i.modificadores.length > 0 && (
                        <span className="text-muted">
                          {' '}
                          · {i.modificadores.map((x) => x.nombre).join(', ')}
                        </span>
                      )}
                      {i.notas && (
                        <span className="ml-1 rounded-sm bg-amber-soft px-1 text-amber-ink">
                          {i.notas}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => accion(`/operacion/pedidos/${e.pedido.id}/confirmar`)}
                    className={`${botonPrincipal} flex-1`}
                  >
                    <CheckCheck className="size-4" aria-hidden /> Confirmar y enviar a cocina
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const motivo = await pedirMotivo('¿Por qué se cancela el pedido?');
                      if (motivo) accion(`/operacion/pedidos/${e.pedido.id}/cancelar`, { motivo });
                    }}
                    className={botonSuave}
                  >
                    Cancelar
                  </button>
                </div>
              </article>
            ) : (
              <article
                key={`listo-${e.mesa}`}
                className="anim-entrar flex items-center gap-3 rounded-lg border-l-4 border-ok bg-app p-3 shadow-tarjeta"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft font-bold text-ok">
                  {e.mesa}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">
                    Mesa {e.mesa} · listo para servir
                    {esperando.some((id) => e.items.some((i) => i.id === id)) && (
                      <span className="ml-1.5 font-normal text-amber">
                        hace {haceCuanto(ahora - Date.parse(e.fecha))}
                      </span>
                    )}
                  </p>
                  <ul className="text-muted">
                    {juntarIguales(e.items).map(([texto, cantidad]) => (
                      <li key={texto}>
                        {cantidad}× {texto}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => servirTodos(e.items)}
                  className={botonPrincipal}
                >
                  Servido
                </button>
              </article>
            ),
          )}
        </aside>
      </div>

      {mesaAbierta && (
        <MesaDetalle
          mesa={mesaAbierta}
          cuenta={cuenta}
          precio={precio}
          onAccion={accion}
          onCuenta={setCuenta}
          onRecargar={() => {
            refrescar();
            if (cuenta) cargarCuenta(cuenta.id);
          }}
          onTomar={() => {
            setTomando(mesaAbierta);
            setMesaAbierta(null);
          }}
          onCerrar={() => setMesaAbierta(null)}
        />
      )}

      {tomando && (
        <TomarPedido
          slug={slug}
          mesa={tomando}
          precio={precio}
          onCerrar={() => setTomando(null)}
          onListo={() => {
            setTomando(null);
            refrescar();
          }}
        />
      )}
    </div>
  );
}
