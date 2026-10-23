import { Bell, CheckCheck, ClipboardList, ReceiptText, Utensils } from 'lucide-react';
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
import { Modal } from '@menu-qr/ui';
import { avisar } from './avisos';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { TomarPedido } from './TomarPedido';
import { BotonSonido, Conexion, Encabezado, formatoPrecio, hora, pedirMotivo } from './ui';

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
const ESTADO_ITEM: Record<ItemDetalle['estado'], string> = {
  PENDIENTE: 'en cocina',
  EN_PREPARACION: 'en preparación',
  LISTO: 'listo',
  ENTREGADO: 'entregado',
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

// Una entrada de la bandeja: llamadas, pedidos por confirmar y platos listos, en orden de llegada.
type Entrada =
  | { tipo: 'llamada'; fecha: string; llamada: Llamada }
  | { tipo: 'pedido'; fecha: string; pedido: PedidoPendiente }
  | { tipo: 'listo'; fecha: string; item: ItemListo };

export function MeseroPage() {
  const { usuario } = useAuth();
  const [tab, setTab] = useState<'mesas' | 'bandeja'>('mesas');
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

  const cargar = useCallback(async () => {
    try {
      const [m, p, l, i] = await Promise.all([
        api<MesaOperacion[]>('/operacion/mesas'),
        api<PedidoPendiente[]>('/operacion/pedidos?estado=PENDIENTE'),
        api<Llamada[]>('/operacion/llamadas?atendida=false'),
        api<ItemListo[]>('/operacion/items?estado=LISTO'),
      ]);
      setMesas(m);
      setPendientes(p);
      setLlamadas(l);
      setListos(i);
      setError(null);
      setCargado(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, [cargar]);

  const cargarCuenta = useCallback(async (id: string | undefined) => {
    setCuenta(id ? await api<CuentaDetalle>(`/operacion/cuentas/${id}`).catch(() => null) : null);
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
      'pedido:cancelado': refrescar,
      'cuenta:cerrada': refrescar,
      'llamada:atendida': refrescar,
    },
    cargar,
  );

  const accion = async (ruta: string, body?: unknown, method = 'PATCH') => {
    await api(ruta, { method, body }).catch((e: Error) => setError(e.message));
    refrescar();
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

  const bandeja: Entrada[] = [
    ...llamadas.map((l) => ({ tipo: 'llamada' as const, fecha: l.createdAt, llamada: l })),
    ...pendientes.map((p) => ({ tipo: 'pedido' as const, fecha: p.createdAt, pedido: p })),
    ...listos.map((i) => ({ tipo: 'listo' as const, fecha: i.updatedAt, item: i })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porMesa = (n: number) => ({
    pedidos: pendientes.filter((p) => p.mesa.numero === n).length,
    llamadas: llamadas.filter((l) => l.mesa.numero === n && l.tipo === 'MESERO').length,
    cuenta: llamadas.some((l) => l.mesa.numero === n && l.tipo === 'CUENTA'),
    listos: listos.filter((i) => i.mesa.numero === n).length,
    esperando: listos.some((i) => i.mesa.numero === n && esperando.includes(i.id)),
  });

  const tabs = [
    { id: 'mesas', texto: 'Mesas', n: 0 },
    { id: 'bandeja', texto: 'Pendientes', n: bandeja.length },
  ] as const;
  const botonPrincipal =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent';
  const botonSuave =
    'inline-flex min-h-11 items-center justify-center rounded-md bg-surface px-4 text-sm font-medium hover:bg-surface-2';

  return (
    <div className="min-h-dvh bg-bg pb-6">
      <Encabezado titulo="Meseros">
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>

      <nav className="flex border-b border-line bg-app" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`flex min-h-12 flex-1 items-center justify-center gap-2 font-medium ${tab === x.id ? 'border-b-2 border-purple text-purple' : 'text-muted'}`}
          >
            {x.texto}
            {x.n > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1.5 text-xs font-bold text-on-amber">
                {x.n}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}. Se vuelve a sincronizar solo; si sigue, revise la conexión.
        </p>
      )}

      {tab === 'mesas' && (
        <main className="mx-auto grid max-w-5xl grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
                className={`flex min-h-28 flex-col items-start gap-1 rounded-lg border-2 p-3 text-left ${b.esperando ? 'alerta-verde' : ''} ${COLOR_MESA[m.estado]}`}
              >
                <span className="flex w-full items-baseline justify-between">
                  <span className="text-3xl font-bold text-fg">{m.numero}</span>
                  {m.cuenta && (
                    <span className="text-xs text-muted tabular-nums">
                      {precio(m.cuenta.total)}
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold">{TEXTO_MESA[m.estado]}</span>
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
      )}

      {tab === 'bandeja' && (
        <main className="mx-auto max-w-2xl space-y-3 p-3">
          {bandeja.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-8 text-center text-muted">
              Nada pendiente. Lo nuevo aparece aquí, lo más antiguo primero.
            </p>
          )}
          {bandeja.map((e) =>
            e.tipo === 'llamada' ? (
              <article
                key={e.llamada.id}
                className="flex items-center gap-3 rounded-lg border-l-4 border-danger bg-app p-3 shadow-tarjeta"
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
                className="rounded-lg border-l-4 border-amber bg-app p-3 shadow-tarjeta"
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
                    onClick={() => {
                      const motivo = pedirMotivo('¿Por qué se cancela el pedido?');
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
                key={e.item.id}
                className={`flex items-center gap-3 rounded-lg border-l-4 border-ok bg-app p-3 shadow-tarjeta ${esperando.includes(e.item.id) ? 'alerta-verde' : ''}`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft font-bold text-ok">
                  {e.item.mesa.numero}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">
                    Listo para llevar: {e.item.cantidad}× {e.item.nombreEs}
                  </p>
                  {e.item.modificadores.length > 0 && (
                    <p className="text-muted">
                      {e.item.modificadores.map((m) => m.nombre).join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    accion(`/operacion/items/${e.item.id}/estado`, { estado: 'ENTREGADO' })
                  }
                  className={botonPrincipal}
                >
                  Entregado
                </button>
              </article>
            ),
          )}
        </main>
      )}

      {mesaAbierta && (
        <Modal etiqueta={`Mesa ${mesaAbierta.numero}`} onCerrar={() => setMesaAbierta(null)}>
          <div className="flex items-center justify-between pt-5 pb-3">
            <h2 className="text-xl font-semibold">Mesa {mesaAbierta.numero}</h2>
            <button type="button" onClick={() => setMesaAbierta(null)} className={botonSuave}>
              Cerrar
            </button>
          </div>
          {cuenta ? (
            <ul className="mb-3 divide-y divide-line text-sm">
              {cuenta.pedidos.flatMap((p) =>
                p.items.map((i) => (
                  <li
                    key={i.id}
                    className={`flex min-h-11 items-center gap-2 py-1 ${i.cancelado ? 'opacity-50' : ''}`}
                  >
                    <span className="flex-1">
                      <span className="tabular-nums">{i.cantidad}×</span> {i.nombreEs}
                      <span className="ml-1.5 text-xs text-muted">
                        {p.estado === 'PENDIENTE'
                          ? 'por confirmar'
                          : i.cancelado
                            ? 'cancelado'
                            : ESTADO_ITEM[i.estado]}
                      </span>
                    </span>
                    {!i.cancelado &&
                      p.estado === 'CONFIRMADO' &&
                      (i.estado === 'PENDIENTE' || i.estado === 'EN_PREPARACION') && (
                        <button
                          type="button"
                          onClick={async () => {
                            const motivo = pedirMotivo(`¿Por qué se cancela ${i.nombreEs}?`);
                            if (motivo) {
                              await accion(`/operacion/items/${i.id}/cancelar`, { motivo });
                              cargarCuenta(cuenta.id);
                            }
                          }}
                          className="min-h-11 px-2 text-xs font-medium text-danger underline"
                        >
                          Cancelar
                        </button>
                      )}
                  </li>
                )),
              )}
              <li className="flex justify-between py-3 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{precio(cuenta.total)}</span>
              </li>
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted">Mesa libre: todavía no tiene cuenta.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setTomando(mesaAbierta);
              setMesaAbierta(null);
            }}
            className="flex h-14 w-full items-center justify-center rounded-md bg-purple text-[15.5px] font-semibold text-on-accent"
          >
            Tomar pedido
          </button>
        </Modal>
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
