import { Printer, Undo2, Users } from 'lucide-react';
import { IconoMesa, QuantityStepper } from '@menu-qr/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  calcularTotales,
  type CuentaDetalle,
  type ItemDetalle,
  type MenuPublico,
  type MesaOperacion,
  type MetodoPago,
  type Totales,
} from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { Conexion, Encabezado, formatoPrecio, hora } from './ui';

const METODOS: { id: MetodoPago; texto: string }[] = [
  { id: 'EFECTIVO', texto: 'Efectivo' },
  { id: 'TARJETA', texto: 'Tarjeta' },
  { id: 'SINPE', texto: 'SINPE Móvil' },
  { id: 'MIXTO', texto: 'Mixto' },
];
const NOMBRE_METODO = Object.fromEntries(METODOS.map((m) => [m.id, m.texto]));

// Lo que sale en el ticket de 80 mm (toda la cuenta o un grupo de una cuenta separada).
type Ticket = {
  titulo: string;
  lineas: { id: string; cantidad: number; nombre: string; monto: number }[];
  totales: Totales;
  metodo?: string;
};
const lineasDe = (items: ItemDetalle[]) =>
  items.map((i) => ({
    id: i.id,
    cantidad: i.cantidad,
    nombre: i.nombreEs,
    monto: i.precioUnitario * i.cantidad,
  }));

const claseBoton = (activo: boolean) =>
  `min-h-11 rounded-md px-4 text-sm font-medium ${activo ? 'bg-purple text-on-accent' : 'bg-surface hover:bg-surface-2'}`;

export function CajaPage() {
  const { usuario } = useAuth();
  const [mesas, setMesas] = useState<MesaOperacion[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [modo, setModo] = useState<'junto' | 'separado'>('junto');
  const [eleccion, setEleccion] = useState<Record<string, number>>({}); // itemId → unidades
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [menu, setMenu] = useState<MenuPublico>();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (usuario?.restaurante) obtenerMenu(usuario.restaurante.slug).then(setMenu, () => {});
  }, [usuario]);
  const r = menu?.restaurante;
  const precio = formatoPrecio(r?.moneda ?? 'CRC');
  const iva = r?.porcentajeIva ?? 13;
  const servicio = r?.porcentajeServicio ?? 10;

  const cargar = useCallback(async () => {
    try {
      setMesas(await api<MesaOperacion[]>('/operacion/mesas'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const cargarCuenta = useCallback(async (id: string | null) => {
    const c = id ? await api<CuentaDetalle>(`/operacion/cuentas/${id}`).catch(() => null) : null;
    setCuenta(c);
    // Si ya se empezó a cobrar por separado, se sigue en ese modo.
    if (c?.pagos.length) setModo('separado');
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    cargarCuenta(seleccion);
    setMetodo(null);
    setModo('junto');
    setEleccion({});
    setNombreGrupo('');
  }, [seleccion, cargarCuenta]);

  const refrescar = useRefrescoAgrupado(() => {
    cargar();
    cargarCuenta(seleccion);
  });
  const conectado = useTiempoReal(
    {
      'cuenta:actualizada': refrescar,
      'cuenta:solicitada': refrescar,
      'cuenta:cerrada': refrescar,
    },
    refrescar,
  );

  // Imprime el ticket indicado (se dibuja y luego se abre el diálogo de impresión).
  const imprimir = (t: Ticket) => {
    setTicket(t);
    setTimeout(() => window.print(), 50);
  };

  // Primero las que pidieron cobrar; luego por antigüedad.
  const abiertas = mesas
    .filter((m) => m.cuenta)
    .sort(
      (a, b) =>
        Number(b.cuenta!.estado === 'PIDIO_CUENTA') - Number(a.cuenta!.estado === 'PIDIO_CUENTA') ||
        a.cuenta!.abiertaEn.localeCompare(b.cuenta!.abiertaEn),
    );

  const items =
    cuenta?.pedidos
      .filter((p) => p.estado === 'CONFIRMADO')
      .flatMap((p) => p.items.filter((i) => !i.cancelado)) ?? [];
  const sinPagar = items.filter((i) => !i.pagoId);
  const pendientes = cuenta?.pedidos.some((p) => p.estado === 'PENDIENTE');
  const elegidos = sinPagar.filter((i) => eleccion[i.id]);
  const totalGrupo = r
    ? calcularTotales(
        elegidos.map((i) => ({ precioUnitario: i.precioUnitario, cantidad: eleccion[i.id]! })),
        r,
      )
    : null;

  const accion = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const cerrarJunto = () =>
    cuenta &&
    metodo &&
    confirm(`¿Cerrar la cuenta de la mesa ${cuenta.mesa.numero} por ${precio(cuenta.total)}?`) &&
    accion(async () => {
      await api(`/operacion/cuentas/${cuenta.id}/cerrar`, {
        method: 'POST',
        body: { metodoPago: metodo },
      });
      setSeleccion(null);
      cargar();
    });

  const cobrarGrupo = () =>
    cuenta &&
    metodo &&
    elegidos.length > 0 &&
    accion(async () => {
      const r = await api<{ cuenta: CuentaDetalle; cerrada: boolean }>(
        `/operacion/cuentas/${cuenta.id}/pagos`,
        {
          method: 'POST',
          body: {
            nombre: nombreGrupo.trim() || undefined,
            metodoPago: metodo,
            items: elegidos.map((i) => ({ itemId: i.id, cantidad: eleccion[i.id] })),
          },
        },
      );
      setEleccion({});
      setNombreGrupo('');
      setMetodo(null);
      if (r.cerrada) {
        setSeleccion(null);
        cargar();
      } else setCuenta(r.cuenta);
    });

  const deshacer = (pagoId: string) =>
    cuenta &&
    confirm('¿Deshacer este cobro? Sus platos vuelven a quedar sin pagar.') &&
    accion(async () =>
      setCuenta(
        await api<CuentaDetalle>(`/operacion/cuentas/${cuenta.id}/pagos/${pagoId}`, {
          method: 'DELETE',
        }),
      ),
    );

  const ticketCuenta = (c: CuentaDetalle): Ticket => ({
    titulo: `PRE-CUENTA · Mesa ${c.mesa.numero}`,
    lineas: lineasDe(items),
    totales: c,
  });

  return (
    <div className="min-h-dvh bg-bg">
      <Encabezado titulo="Caja">
        <Conexion conectado={conectado} />
      </Encabezado>
      {error && (
        <p className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger print:hidden">
          {error}
        </p>
      )}

      <div className="mx-auto grid max-w-6xl items-start gap-4 p-4 md:grid-cols-[320px_1fr] print:hidden">
        <aside className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">
            Cuentas abiertas
          </h2>
          {abiertas.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
              No hay cuentas abiertas.
            </p>
          )}
          {abiertas.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSeleccion(m.cuenta!.id)}
              aria-pressed={seleccion === m.cuenta!.id}
              className={`anim-entrar flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border-2 bg-app p-3 text-left shadow-tarjeta hover:-translate-y-0.5 hover:shadow-app ${
                seleccion === m.cuenta!.id
                  ? 'border-purple'
                  : m.cuenta!.estado === 'PIDIO_CUENTA'
                    ? 'border-amber'
                    : 'border-transparent'
              }`}
            >
              <IconoMesa className="size-7 shrink-0 text-purple" />
              <span className="flex-1">
                <span className="font-semibold">Mesa {m.numero}</span>
                {m.cuenta!.estado === 'PIDIO_CUENTA' && (
                  <span className="ml-2 rounded-full bg-amber px-2 py-0.5 text-xs font-semibold text-on-amber">
                    pidió cuenta
                  </span>
                )}
                <span className="block text-xs text-muted">
                  desde {hora(m.cuenta!.abiertaEn)}
                  {m.cuenta!.personas ? ` · ${m.cuenta!.personas} personas` : ''}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{precio(m.cuenta!.total)}</span>
            </button>
          ))}
        </aside>

        <section className="rounded-lg bg-app p-5 shadow-tarjeta md:sticky md:top-20">
          {!cuenta ? (
            <p className="py-10 text-center text-muted">
              Elija una cuenta de la lista para ver el detalle y cobrarla.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Mesa {cuenta.mesa.numero}</h2>
                <div
                  role="group"
                  aria-label="¿Cómo pagan?"
                  className="flex items-center gap-1 rounded-md bg-surface p-1"
                >
                  <span className="px-2 text-xs text-muted">¿Cómo pagan?</span>
                  <button
                    type="button"
                    aria-pressed={modo === 'junto'}
                    disabled={cuenta.pagos.length > 0}
                    onClick={() => setModo('junto')}
                    className={claseBoton(modo === 'junto')}
                  >
                    Todo junto
                  </button>
                  <button
                    type="button"
                    aria-pressed={modo === 'separado'}
                    onClick={() => setModo('separado')}
                    className={claseBoton(modo === 'separado')}
                  >
                    <Users className="mr-1 inline size-4" aria-hidden /> Separado
                  </button>
                </div>
              </div>

              {pendientes && (
                <p className="mb-3 rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
                  Hay pedidos sin confirmar: el mesero debe confirmarlos o cancelarlos antes de
                  cobrar.
                </p>
              )}

              {modo === 'junto' ? (
                <>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-line">
                      {items.map((i) => (
                        <tr key={i.id}>
                          <td className="w-10 py-1.5 pr-2 align-top tabular-nums">{i.cantidad}×</td>
                          <td className="py-1.5">
                            {i.nombreEs}
                            {i.modificadores.length > 0 && (
                              <span className="text-muted">
                                {' '}
                                ({i.modificadores.map((m) => m.nombre).join(', ')})
                              </span>
                            )}
                          </td>
                          <td className="w-28 py-1.5 text-right align-top tabular-nums">
                            {precio(i.precioUnitario * i.cantidad)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Desglose totales={cuenta} precio={precio} iva={iva} servicio={servicio} />
                  <Metodos metodo={metodo} onElegir={setMetodo} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => imprimir(ticketCuenta(cuenta))}
                      className="inline-flex min-h-12 items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium hover:bg-surface-2"
                    >
                      <Printer className="size-4" aria-hidden /> Imprimir pre-cuenta
                    </button>
                    <button
                      type="button"
                      onClick={cerrarJunto}
                      disabled={!metodo || ocupado || pendientes}
                      className="min-h-12 flex-1 rounded-md bg-purple font-semibold text-on-accent disabled:opacity-50"
                    >
                      {ocupado ? 'Cerrando…' : `Cobrar todo · ${precio(cuenta.total)}`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {cuenta.pagos.length > 0 && (
                    <div className="mb-4 space-y-2">
                      <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                        Ya cobrado
                      </h3>
                      {cuenta.pagos.map((p, n) => {
                        const suyos = items.filter((i) => i.pagoId === p.id);
                        const titulo = p.nombre || `Grupo ${n + 1}`;
                        return (
                          <div key={p.id} className="anim-entrar rounded-md bg-ok-soft p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex-1 font-semibold text-ok">
                                {titulo} · {NOMBRE_METODO[p.metodoPago]}
                              </span>
                              <span className="font-semibold tabular-nums">{precio(p.total)}</span>
                            </div>
                            <p className="mt-0.5 text-muted">
                              {suyos.map((i) => `${i.cantidad}× ${i.nombreEs}`).join(', ')}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  imprimir({
                                    titulo: `COMPROBANTE · Mesa ${cuenta.mesa.numero} · ${titulo}`,
                                    lineas: lineasDe(suyos),
                                    totales: p,
                                    metodo: NOMBRE_METODO[p.metodoPago],
                                  })
                                }
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-app px-3 font-medium hover:bg-surface"
                              >
                                <Printer className="size-4" aria-hidden /> Imprimir
                              </button>
                              <button
                                type="button"
                                onClick={() => deshacer(p.id)}
                                disabled={ocupado}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-muted hover:bg-app"
                              >
                                <Undo2 className="size-4" aria-hidden /> Deshacer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                    Elija lo que paga este grupo ({sinPagar.length} por cobrar)
                  </h3>
                  <ul className="mt-2 divide-y divide-line text-sm">
                    {sinPagar.map((i) => {
                      const n = eleccion[i.id] ?? 0;
                      return (
                        <li key={i.id} className="flex min-h-12 items-center gap-3 py-1.5">
                          <input
                            type="checkbox"
                            aria-label={`Incluir ${i.nombreEs}`}
                            checked={n > 0}
                            onChange={() =>
                              setEleccion((e) => ({ ...e, [i.id]: n > 0 ? 0 : i.cantidad }))
                            }
                            className="size-5 accent-purple"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="tabular-nums">{i.cantidad}×</span> {i.nombreEs}
                            {i.modificadores.length > 0 && (
                              <span className="text-muted">
                                {' '}
                                ({i.modificadores.map((m) => m.nombre).join(', ')})
                              </span>
                            )}
                          </span>
                          {n > 0 && i.cantidad > 1 && (
                            <QuantityStepper
                              valor={n}
                              min={1}
                              max={i.cantidad}
                              onCambio={(v) => setEleccion((e) => ({ ...e, [i.id]: v }))}
                            />
                          )}
                          <span className="w-24 text-right tabular-nums">
                            {precio(i.precioUnitario * (n || i.cantidad))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {sinPagar.length > 0 && (
                    <>
                      <label className="mt-3 block text-sm">
                        <span className="font-medium">Nombre del grupo (opcional)</span>
                        <input
                          value={nombreGrupo}
                          maxLength={40}
                          placeholder="Ej.: Ana"
                          onChange={(e) => setNombreGrupo(e.target.value)}
                          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
                        />
                      </label>
                      {totalGrupo && elegidos.length > 0 && (
                        <Desglose
                          totales={totalGrupo}
                          precio={precio}
                          iva={iva}
                          servicio={servicio}
                        />
                      )}
                      <Metodos metodo={metodo} onElegir={setMetodo} />
                      <button
                        type="button"
                        onClick={cobrarGrupo}
                        disabled={!metodo || !elegidos.length || ocupado || pendientes}
                        className="mt-4 min-h-12 w-full rounded-md bg-purple font-semibold text-on-accent disabled:opacity-50"
                      >
                        {elegidos.length && totalGrupo
                          ? `Cobrar este grupo · ${precio(totalGrupo.total)}`
                          : 'Elija los platos de este grupo'}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* Ticket de 80 mm: solo visible al imprimir (ver index.css). */}
      {ticket && (
        <div className="ticket hidden print:block">
          <p className="text-center font-bold">{r?.nombre ?? usuario?.restaurante?.nombre}</p>
          <p className="text-center">{ticket.titulo}</p>
          <p className="text-center">{new Date().toLocaleString('es-CR')}</p>
          <hr />
          {ticket.lineas.map((l) => (
            <div key={l.id} className="flex justify-between gap-2">
              <span>
                {l.cantidad} {l.nombre}
              </span>
              <span>{precio(l.monto)}</span>
            </div>
          ))}
          <hr />
          <Desglose totales={ticket.totales} precio={precio} iva={iva} servicio={servicio} />
          {ticket.metodo && <p>Pagado con: {ticket.metodo}</p>}
          <hr />
          <p className="text-center font-bold">*** NO ES FACTURA ELECTRÓNICA ***</p>
          <p className="text-center">Documento informativo sin validez fiscal.</p>
        </div>
      )}
    </div>
  );
}

function Metodos({
  metodo,
  onElegir,
}: {
  metodo: MetodoPago | null;
  onElegir: (m: MetodoPago) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm font-medium">Método de pago</legend>
      <div className="flex flex-wrap gap-2">
        {METODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={metodo === m.id}
            onClick={() => onElegir(m.id)}
            className={claseBoton(metodo === m.id)}
          >
            {m.texto}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Desglose({
  totales,
  precio,
  iva,
  servicio,
}: {
  totales: Totales;
  precio: (c: number) => string;
  iva: number;
  servicio: number;
}) {
  const fila = (texto: string, monto: number, fuerte = false) => (
    <div className={`flex justify-between ${fuerte ? 'text-base font-bold' : ''}`}>
      <span>{texto}</span>
      <span className="tabular-nums">{precio(monto)}</span>
    </div>
  );
  return (
    <div className="mt-3 space-y-1 border-t border-line pt-2 text-sm">
      {fila('Subtotal', totales.subtotal)}
      {fila(`Servicio (${servicio}%)`, totales.montoServicio)}
      {fila(`IVA (${iva}%)`, totales.montoIva)}
      {fila('Total', totales.total, true)}
    </div>
  );
}
