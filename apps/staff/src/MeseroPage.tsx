import { useCallback, useEffect, useState } from 'react';
import type {
  CuentaDetalle,
  EstadoMesa,
  ItemDetalle,
  MenuPublico,
  MesaOperacion,
  PedidoDetalle,
} from '@menu-qr/shared';
import { activarSonido, sonar, sonidoActivo, vibrar } from './alertas';
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

const COLOR_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'bg-white border-stone-300 text-stone-500',
  OCUPADA: 'bg-sky-100 border-sky-500 text-sky-900',
  PEDIDO_PENDIENTE: 'bg-amber-100 border-amber-500 text-amber-900',
  PIDIO_CUENTA: 'bg-violet-100 border-violet-500 text-violet-900',
  LLAMADA: 'bg-red-100 border-red-600 text-red-900 animate-pulse',
};
const ESTADO_ITEM: Record<ItemDetalle['estado'], string> = {
  PENDIENTE: 'en cocina',
  EN_PREPARACION: 'en preparación',
  LISTO: 'listo',
  ENTREGADO: 'entregado',
};
const TEXTO_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  PEDIDO_PENDIENTE: 'Por confirmar',
  PIDIO_CUENTA: 'Pidió cuenta',
  LLAMADA: 'Llamando',
};

export function MeseroPage() {
  const { usuario } = useAuth();
  const [tab, setTab] = useState<'mesas' | 'pendientes' | 'listos'>('mesas');
  const [mesas, setMesas] = useState<MesaOperacion[]>([]);
  const [pendientes, setPendientes] = useState<PedidoPendiente[]>([]);
  const [llamadas, setLlamadas] = useState<Llamada[]>([]);
  const [listos, setListos] = useState<ItemListo[]>([]);
  const [mesaAbierta, setMesaAbierta] = useState<MesaOperacion | null>(null);
  const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
  const [tomando, setTomando] = useState<MesaOperacion | null>(null);
  const [menu, setMenu] = useState<MenuPublico>();
  const [sonido, setSonido] = useState(sonidoActivo());
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
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const cargarCuenta = useCallback(async (id: string | undefined) => {
    setCuenta(id ? await api<CuentaDetalle>(`/operacion/cuentas/${id}`).catch(() => null) : null);
  }, []);

  const refrescar = useRefrescoAgrupado(() => {
    cargar();
    if (mesaAbierta) cargarCuenta(mesaAbierta.cuenta?.id);
  });
  const alerta = () => {
    sonar(2);
    vibrar();
    refrescar();
  };
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

  const nPendientes = pendientes.length + llamadas.length;
  return (
    <div className="min-h-dvh bg-stone-100 pb-6">
      <Encabezado titulo="Meseros">
        <BotonSonido activo={sonido} onActivar={() => (activarSonido(), setSonido(true))} />
        <Conexion conectado={conectado} />
      </Encabezado>

      <nav className="flex bg-white text-sm shadow-sm" role="tablist">
        {(
          [
            ['mesas', 'Mesas'],
            ['pendientes', `Pendientes${nPendientes ? ` (${nPendientes})` : ''}`],
            ['listos', `Para llevar${listos.length ? ` (${listos.length})` : ''}`],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 font-medium ${tab === id ? 'border-b-2 border-teal-700 text-teal-800' : 'text-stone-500'}`}
          >
            {texto}
          </button>
        ))}
      </nav>

      {error && <p className="m-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</p>}

      {tab === 'mesas' && (
        <main className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-5">
          {mesas.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => abrirMesa(m)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border-2 ${COLOR_MESA[m.estado]}`}
            >
              <span className="text-2xl font-bold">{m.numero}</span>
              <span className="text-xs font-medium">{TEXTO_MESA[m.estado]}</span>
              {m.cuenta && <span className="text-xs tabular-nums">{precio(m.cuenta.total)}</span>}
            </button>
          ))}
        </main>
      )}

      {tab === 'pendientes' && (
        <main className="space-y-3 p-3">
          {nPendientes === 0 && <p className="p-6 text-center text-stone-500">Nada pendiente.</p>}
          {llamadas.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 rounded-xl border-2 border-red-500 bg-white p-3"
            >
              <span className="text-2xl">{l.tipo === 'CUENTA' ? '🧾' : '🙋'}</span>
              <div className="flex-1">
                <p className="font-semibold">
                  Mesa {l.mesa.numero} ·{' '}
                  {l.tipo === 'CUENTA' ? 'pide la cuenta' : 'llama al mesero'}
                </p>
                <p className="text-xs text-stone-500">{hora(l.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => accion(`/operacion/llamadas/${l.id}/atender`)}
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white"
              >
                Atendida
              </button>
            </div>
          ))}
          {pendientes.map((p) => (
            <div key={p.id} className="rounded-xl border-2 border-amber-500 bg-white p-3">
              <p className="font-semibold">
                Mesa {p.mesa.numero} · pedido de las {hora(p.createdAt)}
              </p>
              <ul className="my-2 text-sm">
                {p.items.map((i) => (
                  <li key={i.id}>
                    {i.cantidad}× {i.nombreEs}
                    {i.modificadores.length > 0 && (
                      <span className="text-stone-500">
                        {' '}
                        ({i.modificadores.map((x) => x.nombre).join(', ')})
                      </span>
                    )}
                    {i.notas && <em className="text-amber-800"> “{i.notas}”</em>}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => accion(`/operacion/pedidos/${p.id}/confirmar`)}
                  className="h-11 flex-1 rounded-lg bg-teal-700 font-medium text-white"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const motivo = pedirMotivo('¿Por qué se cancela el pedido?');
                    if (motivo) accion(`/operacion/pedidos/${p.id}/cancelar`, { motivo });
                  }}
                  className="h-11 rounded-lg border border-stone-300 px-4 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ))}
        </main>
      )}

      {tab === 'listos' && (
        <main className="space-y-2 p-3">
          {listos.length === 0 && (
            <p className="p-6 text-center text-stone-500">Nada listo para llevar.</p>
          )}
          {listos.map((i) => (
            <div
              key={i.id}
              className="flex items-center gap-3 rounded-xl border-2 border-emerald-500 bg-white p-3"
            >
              <span className="text-xl font-bold">M{i.mesa.numero}</span>
              <div className="flex-1 text-sm">
                <p className="font-medium">
                  {i.cantidad}× {i.nombreEs}
                </p>
                {i.modificadores.length > 0 && (
                  <p className="text-stone-500">
                    {i.modificadores.map((m) => m.nombre).join(' · ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => accion(`/operacion/items/${i.id}/estado`, { estado: 'ENTREGADO' })}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
              >
                Entregado
              </button>
            </div>
          ))}
        </main>
      )}

      {mesaAbierta && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/40"
          onClick={() => setMesaAbierta(null)}
        >
          <div
            className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Mesa {mesaAbierta.numero}</h2>
              <button
                type="button"
                onClick={() => setMesaAbierta(null)}
                className="text-sm text-stone-500"
              >
                Cerrar
              </button>
            </div>
            {cuenta ? (
              <ul className="mb-3 divide-y text-sm">
                {cuenta.pedidos.flatMap((p) =>
                  p.items.map((i) => (
                    <li
                      key={i.id}
                      className={`flex items-center gap-2 py-2 ${i.cancelado ? 'opacity-50' : ''}`}
                    >
                      <span className="flex-1">
                        {i.cantidad}× {i.nombreEs}
                        <span className="ml-1 text-xs text-stone-500">
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
                            className="text-xs text-red-700 underline"
                          >
                            Cancelar
                          </button>
                        )}
                    </li>
                  )),
                )}
                <li className="flex justify-between py-2 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{precio(cuenta.total)}</span>
                </li>
              </ul>
            ) : (
              <p className="mb-3 text-sm text-stone-500">Mesa libre.</p>
            )}
            <button
              type="button"
              onClick={() => {
                setTomando(mesaAbierta);
                setMesaAbierta(null);
              }}
              className="h-12 w-full rounded-lg bg-teal-700 font-semibold text-white"
            >
              Tomar pedido
            </button>
          </div>
        </div>
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
