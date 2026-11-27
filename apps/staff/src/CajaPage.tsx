import { PanelRightClose, PanelRightOpen, Plus, Printer, Undo2, Users, X } from 'lucide-react';
import { IconoMesa, QuantityStepper } from '@menu-qr/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  calcularTotales,
  type CuentaDetalle,
  type EfectivoRepartidor,
  type ItemDetalle,
  type LineaCobroDetalle,
  type LineaCobroInput,
  type MenuPublico,
  type MesaOperacion,
  type MetodoPago,
  metodoDeLineas,
  type Totales,
  type TurnoCajaDetalle,
} from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { FacturaA, receptorDelCobro, useComprobantes, type FormReceptor } from './FacturaCaja';
import { TicketCierre, TurnoCaja } from './TurnoCaja';
import { Conexion, Encabezado, formatoPrecio, hora, MenuMas, TituloColumna } from './ui';
import { confirmar } from './dialogos';

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
  pago?: string[]; // detalle del cobro: "Efectivo ₡10 000 · vuelto ₡847"
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
  const [cobro, setCobro] = useState<Cobro>(COBRO_VACIO);
  const [receptor, setReceptor] = useState<FormReceptor | null>(null); // factura a nombre de…
  const [modo, setModo] = useState<'junto' | 'separado'>('junto');
  const [eleccion, setEleccion] = useState<Record<string, number>>({}); // itemId → unidades
  const [nombreGrupo, setNombreGrupo] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [cierre, setCierre] = useState<TurnoCajaDetalle | null>(null); // ticket del arqueo
  const [version, setVersion] = useState(0); // ventas nuevas → el turno recalcula el esperado
  const fe = useComprobantes(version); // factura electrónica: activa y últimos comprobantes
  const [menu, setMenu] = useState<MenuPublico>();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'cuenta'>('todas');
  // Panel de caja a la derecha: se puede ocultar y se recuerda en esta computadora.
  const [lateral, setLateral] = useState(() => {
    try {
      return localStorage.getItem('caja:lateral') !== 'oculto';
    } catch {
      return true;
    }
  });
  const cambiarLateral = (v: boolean) => {
    setLateral(v);
    try {
      localStorage.setItem('caja:lateral', v ? 'visible' : 'oculto');
    } catch {
      // sin almacenamiento: solo dura esta visita
    }
  };
  const [efectivo, setEfectivo] = useState<EfectivoRepartidor[]>([]);

  useEffect(() => {
    if (usuario?.restaurante) obtenerMenu(usuario.restaurante.slug).then(setMenu, () => {});
  }, [usuario]);
  const r = menu?.restaurante;
  const precio = formatoPrecio(r?.moneda ?? 'CRC');
  const enColones = (r?.moneda ?? 'CRC') === 'CRC';
  const iva = r?.porcentajeIva ?? 13;
  const servicio = r?.porcentajeServicio ?? 10;

  const cargar = useCallback(async () => {
    try {
      setMesas(await api<MesaOperacion[]>('/operacion/mesas'));
      setVersion((v) => v + 1);
      setEfectivo(await api<EfectivoRepartidor[]>('/enlinea/efectivo'));
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
    setCobro(COBRO_VACIO);
    setReceptor(null);
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
      'enlinea:actualizado': refrescar, // un repartidor entregó y cobró
    },
    refrescar,
  );

  // Imprime el ticket indicado (se dibuja y luego se abre el diálogo de impresión).
  const imprimir = (t: Ticket) => {
    setCierre(null);
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

  const pidieron = abiertas.filter((m) => m.cuenta!.estado === 'PIDIO_CUENTA').length;
  const visibles =
    filtro === 'cuenta' ? abiertas.filter((m) => m.cuenta!.estado === 'PIDIO_CUENTA') : abiertas;

  const items =
    cuenta?.pedidos
      .filter((p) => p.estado === 'CONFIRMADO')
      .flatMap((p) => p.items.filter((i) => !i.cancelado)) ?? [];
  const sinPagar = items.filter((i) => !i.pagoId);
  const pendientes = cuenta?.pedidos.some((p) => p.estado === 'PENDIENTE');
  const elegidos = sinPagar.filter((i) => eleccion[i.id]);
  const totalGrupo = r
    ? calcularTotales(
        elegidos.map((i) => ({
          precioUnitario: i.precioUnitario,
          cantidad: eleccion[i.id]!,
          tarifaIva: i.tarifaIva,
        })),
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

  const cobroJunto = cuenta ? armarCobro(cobro, cuenta.total, precio) : null;
  const cobroGrupo = totalGrupo ? armarCobro(cobro, totalGrupo.total, precio) : null;
  // Confirmación con el vuelto a la vista.
  const confirmarCobro = (texto: string, lineas: LineaCobroInput[]) => {
    const vuelto = lineas.reduce((n, l) => n + (l.recibido ? l.recibido - l.monto : 0), 0);
    return confirmar(texto, {
      detalle: vuelto ? `Vuelto: ${precio(vuelto)}` : undefined,
      boton: 'Cobrar',
    });
  };

  // Factura a nombre de alguien (solo si la factura electrónica está activa).
  const factura = fe.datos?.activa ? receptorDelCobro(receptor) : { error: null };
  const problemas =
    fe.datos?.comprobantes.filter((c) => c.estado === 'ERROR' || c.estado === 'RECHAZADO').length ??
    0;

  const cerrarJunto = async () =>
    cuenta &&
    cobroJunto?.datos &&
    !factura.error &&
    (await confirmarCobro(
      `¿Cerrar la cuenta (${cuenta.lugar}) por ${precio(cuenta.total)}?`,
      cobroJunto.datos.lineas,
    )) &&
    accion(async () => {
      await api(`/operacion/cuentas/${cuenta.id}/cerrar`, {
        method: 'POST',
        body: { ...cobroJunto.datos, receptor: factura.receptor },
      });
      setSeleccion(null);
      cargar();
    });

  const cobrarGrupo = async () =>
    cuenta &&
    cobroGrupo?.datos &&
    !factura.error &&
    totalGrupo &&
    elegidos.length > 0 &&
    (await confirmarCobro(
      `¿Cobrar este grupo por ${precio(totalGrupo.total)}?`,
      cobroGrupo.datos.lineas,
    )) &&
    accion(async () => {
      const r = await api<{ cuenta: CuentaDetalle; cerrada: boolean }>(
        `/operacion/cuentas/${cuenta.id}/pagos`,
        {
          method: 'POST',
          body: {
            nombre: nombreGrupo.trim() || undefined,
            ...cobroGrupo.datos,
            receptor: factura.receptor,
            items: elegidos.map((i) => ({ itemId: i.id, cantidad: eleccion[i.id] })),
          },
        },
      );
      setEleccion({});
      setNombreGrupo('');
      setCobro(COBRO_VACIO);
      setReceptor(null);
      fe.cargar();
      if (r.cerrada) {
        setSeleccion(null);
        cargar();
      } else setCuenta(r.cuenta);
    });

  const deshacer = async (pagoId: string) =>
    cuenta &&
    (await confirmar('¿Deshacer este cobro?', {
      detalle: 'Sus platos vuelven a quedar sin pagar.',
      boton: 'Deshacer cobro',
      peligro: true,
    })) &&
    accion(async () =>
      setCuenta(
        await api<CuentaDetalle>(`/operacion/cuentas/${cuenta.id}/pagos/${pagoId}`, {
          method: 'DELETE',
        }),
      ),
    );

  const nombreGrupoCampo = (
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
        <Desglose totales={totalGrupo} precio={precio} iva={iva} servicio={servicio} />
      )}
    </>
  );

  const ticketCuenta = (c: CuentaDetalle): Ticket => ({
    titulo: `PRE-CUENTA · ${c.lugar}`,
    lineas: lineasDe(items),
    totales: c,
  });

  return (
    <div className="tema-operacion min-h-dvh">
      <Encabezado titulo="Caja">
        <MenuMas
          opciones={[
            {
              a: '/caja/repartidores',
              texto: 'Efectivo de repartidores',
              detalle: 'Pedidos en línea a domicilio',
              contador: efectivo.length,
            },
            ...(fe.datos?.activa
              ? [
                  {
                    a: '/caja/comprobantes',
                    texto: 'Factura electrónica',
                    detalle: problemas
                      ? 'Hay comprobantes con problema'
                      : 'Tiquetes, facturas y notas de crédito',
                    contador: problemas,
                    alerta: true,
                  },
                ]
              : []),
          ]}
        />
        {!lateral && (
          <button
            type="button"
            onClick={() => cambiarLateral(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface px-3 text-sm font-medium hover:bg-surface-2"
          >
            <PanelRightOpen className="size-4" aria-hidden /> Panel de caja
          </button>
        )}
        <Conexion conectado={conectado} />
      </Encabezado>
      {error && (
        <p className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger print:hidden">
          {error}
        </p>
      )}

      <div
        className={`grid items-start gap-4 p-4 print:hidden lg:grid-cols-[290px_minmax(0,1fr)] ${lateral ? 'xl:grid-cols-[290px_minmax(0,1fr)_350px]' : ''}`}
      >
        {/* Cuentas abiertas: columna fija con su propio scroll (en celular, cuadrícula). */}
        <aside className="space-y-2 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1">
          <TituloColumna titulo="Cuentas abiertas" punto="bg-amber" cantidad={abiertas.length} />
          <div
            role="group"
            aria-label="Filtrar cuentas"
            className="flex gap-1 rounded-md bg-surface p-1"
          >
            <button
              type="button"
              aria-pressed={filtro === 'todas'}
              onClick={() => setFiltro('todas')}
              className={`${claseBoton(filtro === 'todas')} min-h-10 min-w-0 flex-1 px-2 text-xs sm:text-sm`}
            >
              Todas ({abiertas.length})
            </button>
            <button
              type="button"
              aria-pressed={filtro === 'cuenta'}
              onClick={() => setFiltro('cuenta')}
              className={`${claseBoton(filtro === 'cuenta')} min-h-10 min-w-0 flex-1 px-2 text-xs sm:text-sm`}
            >
              Pidieron cuenta ({pidieron})
            </button>
          </div>
          {visibles.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
              {filtro === 'cuenta' ? 'Nadie ha pedido la cuenta.' : 'No hay cuentas abiertas.'}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
            {visibles.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSeleccion(m.cuenta!.id)}
                aria-pressed={seleccion === m.cuenta!.id}
                className={`anim-entrar flex min-h-16 w-full min-w-0 items-center justify-between gap-3 rounded-lg border-2 bg-app p-3 text-left shadow-tarjeta hover:-translate-y-0.5 hover:shadow-app ${
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
          </div>
        </aside>

        {/* Cobro: lo que se consumió a la izquierda y cómo pagan a la derecha. */}
        <section className="min-w-0 rounded-lg bg-app p-5 shadow-tarjeta">
          {!cuenta ? (
            <div className="grid min-h-64 place-items-center text-center text-muted">
              <p>
                {abiertas.length
                  ? 'Elija una cuenta de la izquierda para ver el detalle y cobrarla.'
                  : 'No hay cuentas abiertas por ahora.'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-extrabold">{cuenta.lugar}</h2>
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
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="min-w-0">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-line">
                        {items.map((i) => (
                          <tr key={i.id}>
                            <td className="w-10 py-1.5 pr-2 align-top tabular-nums">
                              {i.cantidad}×
                            </td>
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
                  </div>
                  <div className="min-w-0 xl:border-l xl:border-line xl:pl-6">
                    <PanelCobro
                      cobro={cobro}
                      onCambio={setCobro}
                      total={cuenta.total}
                      precio={precio}
                      billetes={enColones}
                      error={cobroJunto?.error ?? null}
                    />
                    {fe.datos?.activa && <FacturaA valor={receptor} onCambio={setReceptor} />}
                    {factura.error && (
                      <p className="mt-2 text-sm text-amber-ink">{factura.error}</p>
                    )}
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
                        disabled={!cobroJunto?.datos || !!factura.error || ocupado || pendientes}
                        className="min-h-12 flex-1 rounded-md bg-purple font-semibold text-on-accent disabled:opacity-50"
                      >
                        {ocupado ? 'Cerrando…' : `Cobrar todo · ${precio(cuenta.total)}`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="min-w-0">
                    {cuenta.pagos.length > 0 && (
                      <div className="mb-4 space-y-2">
                        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">
                          Ya cobrado
                        </h3>
                        {cuenta.pagos.map((p, n) => {
                          const suyos = items.filter((i) => i.pagoId === p.id);
                          const titulo = p.nombre || `Grupo ${n + 1}`;
                          return (
                            <div
                              key={p.id}
                              className="anim-entrar rounded-md bg-ok-soft p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex-1 font-semibold text-ok">
                                  {titulo} · {NOMBRE_METODO[p.metodoPago]}
                                </span>
                                <span className="font-semibold tabular-nums">
                                  {precio(p.total)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-muted">
                                {suyos.map((i) => `${i.cantidad}× ${i.nombreEs}`).join(', ')}
                              </p>
                              {p.lineas.length > 0 && (
                                <p className="mt-0.5 text-xs">
                                  {p.lineas.map((l) => textoLinea(l, precio)).join(' + ')}
                                </p>
                              )}
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    imprimir({
                                      titulo: `COMPROBANTE · ${cuenta.lugar} · ${titulo}`,
                                      lineas: lineasDe(suyos),
                                      totales: p,
                                      metodo: NOMBRE_METODO[p.metodoPago],
                                      pago: p.lineas.map((l) => textoLinea(l, precio)),
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
                    {sinPagar.length > 0 && nombreGrupoCampo}
                  </div>
                  <div className="min-w-0 xl:border-l xl:border-line xl:pl-6">
                    {sinPagar.length > 0 ? (
                      <>
                        {totalGrupo && elegidos.length > 0 && (
                          <PanelCobro
                            cobro={cobro}
                            onCambio={setCobro}
                            total={totalGrupo.total}
                            precio={precio}
                            billetes={enColones}
                            error={cobroGrupo?.error ?? null}
                          />
                        )}
                        {fe.datos?.activa && totalGrupo && elegidos.length > 0 && (
                          <FacturaA valor={receptor} onCambio={setReceptor} />
                        )}
                        {factura.error && (
                          <p className="mt-2 text-sm text-amber-ink">{factura.error}</p>
                        )}
                        <button
                          type="button"
                          onClick={cobrarGrupo}
                          disabled={
                            !cobroGrupo?.datos ||
                            !!factura.error ||
                            !elegidos.length ||
                            ocupado ||
                            pendientes
                          }
                          className="mt-4 min-h-12 w-full rounded-md bg-purple font-semibold text-on-accent disabled:opacity-50"
                        >
                          {elegidos.length && totalGrupo
                            ? `Cobrar este grupo · ${precio(totalGrupo.total)}`
                            : 'Elija los platos de este grupo'}
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-muted">Todo está cobrado.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Panel de caja: turno y arqueo (se puede ocultar). */}
        {lateral && (
          <aside className="space-y-2 lg:col-start-1 xl:sticky xl:top-20 xl:col-start-auto xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Caja</h2>
              <button
                type="button"
                onClick={() => cambiarLateral(false)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted hover:bg-surface"
              >
                <PanelRightClose className="size-4" aria-hidden /> Ocultar
              </button>
            </div>
            <TurnoCaja
              precio={precio}
              billetes={enColones}
              version={version}
              onImprimir={(t) => {
                setTicket(null);
                setCierre(t);
                setTimeout(() => window.print(), 50);
              }}
            />
          </aside>
        )}
      </div>

      {/* Ticket de 80 mm: solo visible al imprimir (ver index.css). */}
      {cierre && (
        <TicketCierre
          t={cierre}
          restaurante={r?.nombre ?? usuario?.restaurante?.nombre ?? ''}
          precio={precio}
        />
      )}
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
          {ticket.pago?.map((t) => (
            <p key={t}>{t}</p>
          ))}
          <hr />
          <p className="text-center font-bold">*** NO ES FACTURA ELECTRÓNICA ***</p>
          <p className="text-center">Documento informativo sin validez fiscal.</p>
        </div>
      )}
    </div>
  );
}

// --- Detalle del cobro (Fase 13): cuánto dio, vuelto, tarjeta, SINPE y mixto ---

type MetodoLinea = LineaCobroInput['metodo'];
type LineaUI = {
  metodo: MetodoLinea;
  monto: string; // solo en mixto; con un método el monto es el total
  recibido: string;
  ultimos4: string;
  autorizacion: string;
  comprobante: string;
};
type Cobro = { metodo: MetodoPago | null; lineas: LineaUI[] };
const nuevaLinea = (metodo: MetodoLinea): LineaUI => ({
  metodo,
  monto: '',
  recibido: '',
  ultimos4: '',
  autorizacion: '',
  comprobante: '',
});
const COBRO_VACIO: Cobro = { metodo: null, lineas: [] };
const aCentimos = (v: string) => {
  const n = Number(v.replace(/[\s,]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

// Arma lo que se manda a la API, o dice qué falta para poder cobrar.
function armarCobro(
  c: Cobro,
  total: number,
  precio: (n: number) => string,
): { datos: { metodoPago: MetodoPago; lineas: LineaCobroInput[] } | null; error: string | null } {
  const no = (error: string | null) => ({ datos: null, error });
  if (!c.metodo) return no(null);
  const mixto = c.metodo === 'MIXTO';
  const lineas: LineaCobroInput[] = [];
  for (const l of c.lineas) {
    const monto = mixto ? aCentimos(l.monto) : total;
    if (!monto) return no('Escriba el monto de cada parte');
    const linea: LineaCobroInput = { metodo: l.metodo, monto };
    if (l.metodo === 'EFECTIVO' && l.recibido.trim()) {
      const recibido = aCentimos(l.recibido);
      if (recibido < monto) return no('Lo que entregó en efectivo no alcanza');
      linea.recibido = recibido;
    }
    if (l.metodo === 'TARJETA') {
      if (l.ultimos4 && !/^\d{4}$/.test(l.ultimos4))
        return no('Los últimos dígitos de la tarjeta son 4 números');
      if (l.ultimos4) linea.ultimos4 = l.ultimos4;
      if (l.autorizacion.trim()) linea.autorizacion = l.autorizacion.trim();
    }
    if (l.metodo === 'SINPE' && l.comprobante.trim()) linea.comprobante = l.comprobante.trim();
    lineas.push(linea);
  }
  const falta = total - lineas.reduce((n, l) => n + l.monto, 0);
  if (falta > 0) return no(`Falta ${precio(falta)}`);
  if (falta < 0) return no(`Sobra ${precio(-falta)}: revise los montos`);
  return { datos: { metodoPago: metodoDeLineas(lineas), lineas }, error: null };
}

const NOMBRE_LINEA: Record<MetodoLinea, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  SINPE: 'SINPE',
};
function textoLinea(l: LineaCobroDetalle, precio: (n: number) => string) {
  const partes = [`${NOMBRE_LINEA[l.metodo as MetodoLinea] ?? l.metodo} ${precio(l.monto)}`];
  if (l.recibido) partes.push(`recibió ${precio(l.recibido)}`, `vuelto ${precio(l.vuelto)}`);
  if (l.ultimos4) partes.push(`····${l.ultimos4}`);
  if (l.autorizacion) partes.push(`Aut. ${l.autorizacion}`);
  if (l.comprobante) partes.push(`Comp. ${l.comprobante}`);
  return partes.join(' · ');
}

// Billetes rápidos para "le dio": exacto, redondeo a mil y billetes comunes por encima del monto.
function billetesPara(monto: number) {
  const mil = 100000;
  const opciones = [monto, Math.ceil(monto / mil) * mil, 500000, 1000000, 2000000, 5000000];
  return [...new Set(opciones)].filter((n) => n >= monto).slice(0, 5);
}

const claseCampo = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 tabular-nums';

function PanelCobro({
  cobro,
  onCambio,
  total,
  precio,
  billetes,
  error,
}: {
  cobro: Cobro;
  onCambio: (c: Cobro) => void;
  total: number;
  precio: (n: number) => string;
  billetes: boolean; // botones de billetes (solo en colones)
  error: string | null;
}) {
  const elegir = (m: MetodoPago) =>
    onCambio({
      metodo: m,
      lineas: m === 'MIXTO' ? [nuevaLinea('EFECTIVO'), nuevaLinea('TARJETA')] : [nuevaLinea(m)],
    });
  const cambiar = (i: number, cambio: Partial<LineaUI>) =>
    onCambio({
      ...cobro,
      lineas: cobro.lineas.map((l, n) => (n === i ? { ...l, ...cambio } : l)),
    });
  const mixto = cobro.metodo === 'MIXTO';
  const montoDe = (l: LineaUI) => (mixto ? aCentimos(l.monto) : total);
  const falta = total - cobro.lineas.reduce((n, l) => n + montoDe(l), 0);
  const aTexto = (c: number) => String(c / 100);

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm font-medium">Método de pago</legend>
      <div className="flex flex-wrap gap-2">
        {METODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={cobro.metodo === m.id}
            onClick={() => elegir(m.id)}
            className={claseBoton(cobro.metodo === m.id)}
          >
            {m.texto}
          </button>
        ))}
      </div>

      {cobro.lineas.length > 0 && (
        <div className="mt-3 space-y-3">
          {cobro.lineas.map((l, i) => {
            const monto = montoDe(l);
            const recibido = aCentimos(l.recibido);
            return (
              <div key={i} className="anim-entrar rounded-lg bg-surface p-3 text-sm">
                {mixto && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex-1">
                      <span className="font-medium">Parte {i + 1}</span>
                      <select
                        value={l.metodo}
                        onChange={(e) =>
                          cambiar(i, {
                            ...nuevaLinea(e.target.value as MetodoLinea),
                            monto: l.monto,
                          })
                        }
                        className={claseCampo}
                      >
                        {(Object.keys(NOMBRE_LINEA) as MetodoLinea[]).map((m) => (
                          <option key={m} value={m}>
                            {NOMBRE_LINEA[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex-1">
                      <span className="font-medium">Monto</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={l.monto}
                        onChange={(e) => cambiar(i, { monto: e.target.value })}
                        className={claseCampo}
                      />
                    </label>
                    {falta > 0 && (
                      <button
                        type="button"
                        onClick={() => cambiar(i, { monto: aTexto(monto + falta) })}
                        className="min-h-11 rounded-md bg-app px-3 font-medium hover:bg-surface-2"
                      >
                        + lo que falta
                      </button>
                    )}
                    {cobro.lineas.length > 2 && (
                      <button
                        type="button"
                        aria-label={`Quitar parte ${i + 1}`}
                        onClick={() =>
                          onCambio({ ...cobro, lineas: cobro.lineas.filter((_, n) => n !== i) })
                        }
                        className="grid min-h-11 min-w-11 place-items-center rounded-md text-muted hover:bg-app"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                )}

                {l.metodo === 'EFECTIVO' && (
                  <div className={mixto ? 'mt-2' : ''}>
                    <label className="block">
                      <span className="font-medium">¿Cuánto le dio? (opcional)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={l.recibido}
                        placeholder={monto ? aTexto(monto) : ''}
                        onChange={(e) => cambiar(i, { recibido: e.target.value })}
                        className={claseCampo}
                      />
                    </label>
                    {monto > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(billetes ? billetesPara(monto) : [monto]).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => cambiar(i, { recibido: aTexto(b) })}
                            className="min-h-11 rounded-md bg-app px-3 font-medium tabular-nums hover:bg-surface-2"
                          >
                            {b === monto ? 'Exacto' : precio(b)}
                          </button>
                        ))}
                      </div>
                    )}
                    {recibido > 0 && monto > 0 && (
                      <p
                        className={`mt-2 font-display text-2xl font-extrabold tabular-nums ${recibido >= monto ? 'text-ok' : 'text-danger'}`}
                      >
                        {recibido >= monto
                          ? `Vuelto: ${precio(recibido - monto)}`
                          : `Faltan ${precio(monto - recibido)}`}
                      </p>
                    )}
                  </div>
                )}

                {l.metodo === 'TARJETA' && (
                  <div className={`grid grid-cols-2 gap-2 ${mixto ? 'mt-2' : ''}`}>
                    <label>
                      <span className="font-medium">Últimos 4 dígitos</span>
                      <input
                        inputMode="numeric"
                        maxLength={4}
                        value={l.ultimos4}
                        placeholder="1234"
                        onChange={(e) =>
                          cambiar(i, { ultimos4: e.target.value.replace(/\D/g, '') })
                        }
                        className={claseCampo}
                      />
                    </label>
                    <label>
                      <span className="font-medium">N.º de autorización</span>
                      <input
                        maxLength={20}
                        value={l.autorizacion}
                        placeholder="Del voucher"
                        onChange={(e) => cambiar(i, { autorizacion: e.target.value })}
                        className={claseCampo}
                      />
                    </label>
                  </div>
                )}

                {l.metodo === 'SINPE' && (
                  <label className={`block ${mixto ? 'mt-2' : ''}`}>
                    <span className="font-medium">N.º de comprobante (opcional)</span>
                    <input
                      maxLength={40}
                      value={l.comprobante}
                      onChange={(e) => cambiar(i, { comprobante: e.target.value })}
                      className={claseCampo}
                    />
                  </label>
                )}
              </div>
            );
          })}

          {mixto && cobro.lineas.length < 6 && (
            <button
              type="button"
              onClick={() =>
                onCambio({ ...cobro, lineas: [...cobro.lineas, nuevaLinea('EFECTIVO')] })
              }
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-surface"
            >
              <Plus className="size-4" aria-hidden /> Agregar otra parte
            </button>
          )}
          {error && <p className="text-sm font-medium text-amber-ink">{error}</p>}
        </div>
      )}
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
