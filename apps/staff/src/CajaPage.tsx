import { Printer } from 'lucide-react';
import { IconoMesa } from '@menu-qr/ui';
import { useCallback, useEffect, useState } from 'react';
import type { CuentaDetalle, MenuPublico, MesaOperacion, MetodoPago } from '@menu-qr/shared';
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

export function CajaPage() {
  const { usuario } = useAuth();
  const [mesas, setMesas] = useState<MesaOperacion[]>([]);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago | null>(null);
  const [menu, setMenu] = useState<MenuPublico>();
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (usuario?.restaurante) obtenerMenu(usuario.restaurante.slug).then(setMenu, () => {});
  }, [usuario]);
  const r = menu?.restaurante;
  const precio = formatoPrecio(r?.moneda ?? 'CRC');

  const cargar = useCallback(async () => {
    try {
      setMesas(await api<MesaOperacion[]>('/operacion/mesas'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const cargarCuenta = useCallback(async (id: string | null) => {
    setCuenta(id ? await api<CuentaDetalle>(`/operacion/cuentas/${id}`).catch(() => null) : null);
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    cargarCuenta(seleccion);
    setMetodo(null);
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

  // Primero las que pidieron cobrar; luego por antigüedad.
  const abiertas = mesas
    .filter((m) => m.cuenta)
    .sort(
      (a, b) =>
        Number(b.cuenta!.estado === 'PIDIO_CUENTA') - Number(a.cuenta!.estado === 'PIDIO_CUENTA') ||
        a.cuenta!.abiertaEn.localeCompare(b.cuenta!.abiertaEn),
    );

  const cerrar = async () => {
    if (
      !cuenta ||
      !metodo ||
      !confirm(`¿Cerrar la cuenta de la mesa ${cuenta.mesa.numero} por ${precio(cuenta.total)}?`)
    )
      return;
    setCerrando(true);
    try {
      await api(`/operacion/cuentas/${cuenta.id}/cerrar`, {
        method: 'POST',
        body: { metodoPago: metodo },
      });
      setSeleccion(null);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCerrando(false);
    }
  };

  const items =
    cuenta?.pedidos
      .filter((p) => p.estado === 'CONFIRMADO')
      .flatMap((p) => p.items.filter((i) => !i.cancelado)) ?? [];
  const pendientes = cuenta?.pedidos.some((p) => p.estado === 'PENDIENTE');

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
                <span className="block text-xs text-muted">desde {hora(m.cuenta!.abiertaEn)}</span>
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
              <h2 className="mb-3 text-xl font-semibold">Mesa {cuenta.mesa.numero}</h2>
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
              <Desglose
                cuenta={cuenta}
                precio={precio}
                iva={r?.porcentajeIva ?? 13}
                servicio={r?.porcentajeServicio ?? 10}
              />
              {pendientes && (
                <p className="mt-3 rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
                  Hay pedidos sin confirmar: el mesero debe confirmarlos o cancelarlos antes de
                  cerrar.
                </p>
              )}

              <fieldset className="mt-4">
                <legend className="mb-2 text-sm font-medium">Método de pago</legend>
                <div className="flex flex-wrap gap-2">
                  {METODOS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={metodo === m.id}
                      onClick={() => setMetodo(m.id)}
                      className={`min-h-11 rounded-md px-4 text-sm font-medium ${metodo === m.id ? 'bg-purple text-on-accent' : 'bg-surface hover:bg-surface-2'}`}
                    >
                      {m.texto}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex min-h-12 items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium hover:bg-surface-2"
                >
                  <Printer className="size-4" aria-hidden /> Imprimir pre-cuenta
                </button>
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={!metodo || cerrando || pendientes}
                  className="min-h-12 flex-1 rounded-md bg-purple font-semibold text-on-accent disabled:opacity-50"
                >
                  {cerrando ? 'Cerrando…' : 'Cerrar cuenta'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Ticket de 80 mm: solo visible al imprimir (ver index.css). */}
      {cuenta && (
        <div className="ticket hidden print:block">
          <p className="text-center font-bold">{r?.nombre ?? usuario?.restaurante?.nombre}</p>
          <p className="text-center">PRE-CUENTA · Mesa {cuenta.mesa.numero}</p>
          <p className="text-center">{new Date().toLocaleString('es-CR')}</p>
          <hr />
          {items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2">
              <span>
                {i.cantidad} {i.nombreEs}
              </span>
              <span>{precio(i.precioUnitario * i.cantidad)}</span>
            </div>
          ))}
          <hr />
          <Desglose
            cuenta={cuenta}
            precio={precio}
            iva={r?.porcentajeIva ?? 13}
            servicio={r?.porcentajeServicio ?? 10}
          />
          <hr />
          <p className="text-center font-bold">*** NO ES FACTURA ELECTRÓNICA ***</p>
          <p className="text-center">Documento informativo sin validez fiscal.</p>
        </div>
      )}
    </div>
  );
}

function Desglose({
  cuenta,
  precio,
  iva,
  servicio,
}: {
  cuenta: CuentaDetalle;
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
      {fila('Subtotal', cuenta.subtotal)}
      {fila(`Servicio (${servicio}%)`, cuenta.montoServicio)}
      {fila(`IVA (${iva}%)`, cuenta.montoIva)}
      {fila('Total', cuenta.total, true)}
    </div>
  );
}
