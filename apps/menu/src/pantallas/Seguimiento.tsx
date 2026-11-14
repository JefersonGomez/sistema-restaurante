import { useQuery } from '@tanstack/react-query';
import { Bike, Check, Clock, MapPin, MessageCircle, Phone, Store, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { CuentaDetalle, EtapaEnLinea } from '@menu-qr/shared';
import { Cargando, formatoPrecio, nombreEn, Pastilla } from '@menu-qr/ui';
import * as api from '../api';
import { TotalsSummary } from '../componentes/cuenta';
import { ErrorScreen, Main } from '../componentes/estructura';
import { TarjetaSellos } from '../componentes/sellos';
import { useIdioma, useTextos } from '../estado/idioma';

// Pasos que ve el cliente (domicilio agrega "En camino").
const PASOS: EtapaEnLinea[] = ['RECIBIDO', 'ACEPTADO', 'LISTO', 'EN_CAMINO', 'ENTREGADO'];

// "En preparación" no es una etapa del restaurante: sale de los ítems que cocina ya empezó.
const preparando = (c: CuentaDetalle) =>
  c.pedidos.some((p) => p.items.some((i) => i.estado !== 'PENDIENTE' && !i.cancelado));

// Seguimiento de un pedido en línea: se actualiza solo cada pocos segundos.
export function Seguimiento() {
  const { token = '' } = useParams();
  const t = useTextos();
  const { idioma } = useIdioma();
  const [ahora, setAhora] = useState(Date.now()); // para la cuenta regresiva del SINPE
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, []);
  const q = useQuery({
    queryKey: ['seguimiento', token],
    queryFn: () => api.verSeguimiento(token),
    refetchInterval: (s) => {
      const etapa = s.state.data?.cuenta.enLinea?.etapa;
      return etapa === 'ENTREGADO' || etapa === 'RECHAZADO' ? false : 8000;
    },
    retry: (n, e) => !(e instanceof api.ErrorApi && e.status === 404) && n < 2,
  });
  if (q.error instanceof api.ErrorApi && q.error.status === 404)
    return <ErrorScreen tipo="noEncontrado" />;
  if (q.isError) return <ErrorScreen tipo="error" onReintentar={() => q.refetch()} />;
  if (!q.data) return <Cargando />;

  const { restaurante: r, cuenta: c } = q.data;
  const d = c.enLinea!;
  const precio = formatoPrecio(r.moneda);
  const pasos = PASOS.filter((p) => p !== 'EN_CAMINO' || c.tipo === 'DOMICILIO');
  const actual = pasos.indexOf(d.etapa);
  const esperaPago = d.pagoElegido === 'SINPE' && !d.pagoVerificado;
  const quedan = d.pagarAntesDe ? Math.ceil((Date.parse(d.pagarAntesDe) - ahora) / 60_000) : 0;
  const texto: Record<EtapaEnLinea, string> = {
    RECIBIDO: t.etapaRecibido,
    ACEPTADO: esperaPago
      ? t.etapaEsperandoPago
      : preparando(c)
        ? t.etapaPreparando
        : t.etapaAceptado(d.tiempoEstimadoMin),
    LISTO: c.tipo === 'DOMICILIO' ? t.etapaListoDomicilio : t.etapaListoRecoger,
    EN_CAMINO: t.etapaEnCamino,
    ENTREGADO: t.etapaEntregado,
    RECHAZADO: t.etapaRechazado(d.motivoRechazo),
  };
  const items = c.pedidos.flatMap((p) => p.items);
  // Comprobante por WhatsApp: la persona elige a quién enviarlo (no es factura electrónica).
  const comprobante = [
    `*${r.nombre}*`,
    `${t.pedidoNumero(d.numero)} · ${c.tipo === 'DOMICILIO' ? t.aDomicilio : t.paraRecoger}`,
    ...items
      .filter((i) => !i.cancelado)
      .map(
        (i) => `${i.cantidad}× ${nombreEn(i, idioma)}: ${precio(i.precioUnitario * i.cantidad)}`,
      ),
    ...(d.costoEnvio ? [`${t.envio}: ${precio(d.costoEnvio)}`] : []),
    `*${t.total}: ${precio(c.total)}*`,
    'NO ES FACTURA ELECTRÓNICA',
    window.location.href,
  ].join('\n');

  const horaPedido = new Date(c.abiertaEn).toLocaleTimeString(idioma === 'en' ? 'en-US' : 'es-CR', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const terminado = d.etapa === 'ENTREGADO' || d.etapa === 'RECHAZADO';
  const tono =
    d.etapa === 'RECHAZADO'
      ? 'bg-danger-soft text-danger'
      : d.etapa === 'ENTREGADO'
        ? 'bg-ok-soft text-ok'
        : 'bg-purple-soft text-purple';
  const botonSecundario =
    'flex h-12 items-center justify-center gap-2 rounded-md bg-surface font-semibold hover:bg-surface-2';

  return (
    <Main>
      {/* Computadora: dos columnas a todo el ancho (estado y detalle | entrega y acciones).
          Celular: una sola columna en ese mismo orden. */}
      <header className="flex items-center gap-3">
        {r.logoUrl && (
          <img
            src={r.logoUrl}
            alt=""
            className="size-14 shrink-0 rounded-full bg-surface object-cover md:size-16"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold md:text-[28px]">{r.nombre}</h1>
          <p className="text-sm text-muted">
            {t.pedidoNumero(d.numero)} · {c.tipo === 'DOMICILIO' ? t.aDomicilio : t.paraRecoger}
          </p>
        </div>
        {c.total > 0 && (
          <span className="hidden text-2xl font-semibold tabular-nums md:block">
            {precio(c.total)}
          </span>
        )}
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Estado actual, grande, con los pasos debajo. */}
          <section className={`anim-entrar rounded-lg p-5 md:p-7 ${tono}`}>
            <div
              role="status"
              className="flex items-center gap-4 max-md:flex-col max-md:text-center"
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-full bg-app/60">
                <Utensils className="size-7" aria-hidden />
              </span>
              <p className="text-lg font-semibold text-balance md:text-2xl">{texto[d.etapa]}</p>
            </div>

            {d.etapa !== 'RECHAZADO' && (
              <ol
                className="mt-6 flex flex-col gap-4 text-fg md:flex-row md:gap-0"
                aria-label={t.suPedido}
              >
                {pasos.map((p, i) => {
                  const hecho = i < actual || d.etapa === 'ENTREGADO';
                  const ahora = i === actual && d.etapa !== 'ENTREGADO';
                  const ultimo = i === pasos.length - 1;
                  return (
                    <li
                      key={p}
                      aria-current={ahora ? 'step' : undefined}
                      className="relative flex items-center gap-3 md:flex-1 md:flex-col md:gap-2 md:text-center"
                    >
                      {/* Línea hacia el paso siguiente: vertical en el celular, horizontal en pantallas anchas. */}
                      {!ultimo && (
                        <span
                          aria-hidden
                          className={`absolute top-9 left-[15px] h-[calc(100%-20px)] w-0.5 md:top-4 md:left-[calc(50%+22px)] md:h-0.5 md:w-[calc(100%-44px)] ${hecho ? 'bg-ok' : 'bg-line'}`}
                        />
                      )}
                      <span
                        className={`relative grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${hecho ? 'bg-ok text-on-accent' : ahora ? 'bg-purple text-on-accent ring-4 ring-purple-soft' : 'bg-surface-2 text-muted'}`}
                      >
                        {hecho ? <Check className="size-4" aria-hidden /> : i + 1}
                      </span>
                      <span
                        className={`text-sm md:px-2 md:text-[13px] ${ahora ? 'font-semibold' : hecho ? '' : 'text-muted'}`}
                      >
                        {texto[p]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {d.pagoElegido === 'SINPE' && d.etapa !== 'RECHAZADO' && (
            <p className="rounded-md bg-amber-soft p-4 text-sm text-amber-ink">
              {d.pagoVerificado ? (
                `✓ ${t.pagoVerificado}`
              ) : quedan > 0 || !d.pagarAntesDe ? (
                <>
                  {r.sinpeNumero &&
                    t.sinpeInstrucciones(precio(c.total || 0), r.sinpeNumero, r.sinpeNombre ?? '')}
                  {d.pagarAntesDe && <strong className="block">{t.sinpeQuedan(quedan)}</strong>}
                </>
              ) : (
                <strong>{t.sinpeVencido}</strong>
              )}
            </p>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t.suPedido}</h2>
            <ul className="divide-y divide-line rounded-md bg-surface px-4 text-sm md:text-[15px]">
              {items.map((i) => (
                <li
                  key={i.id}
                  className={`flex items-start gap-3 py-3 ${i.cancelado ? 'line-through opacity-50' : ''}`}
                >
                  <span className="font-semibold tabular-nums">{i.cantidad}×</span>
                  <span className="min-w-0 flex-1">
                    {nombreEn(i, idioma)}
                    {i.modificadores.length > 0 && (
                      <span className="block text-xs text-muted md:text-sm">
                        {i.modificadores
                          .map((m) => (idioma === 'en' && m.nombreEn) || m.nombre)
                          .join(', ')}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{precio(i.precioUnitario * i.cantidad)}</span>
                </li>
              ))}
            </ul>
            {c.total > 0 && (
              <TotalsSummary
                totales={c}
                config={{ ...r, porcentajeServicio: 0 }}
                precio={precio}
                etiquetaTotal={t.total}
                envio={d.costoEnvio}
              />
            )}
          </section>
        </div>

        {/* Columna lateral: fija al hacer scroll en computadora. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-8">
          <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 text-sm">
            <h2 className="font-semibold">{t.seguimientoEntrega}</h2>
            <p className="flex items-center gap-2">
              {c.tipo === 'DOMICILIO' ? (
                <Bike className="size-4 shrink-0 text-muted" aria-hidden />
              ) : (
                <Store className="size-4 shrink-0 text-muted" aria-hidden />
              )}
              {c.tipo === 'DOMICILIO' ? t.aDomicilio : t.paraRecoger}
            </p>
            {c.tipo === 'DOMICILIO' && d.direccion && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>
                  {d.direccion}
                  {d.referencia && <span className="block text-muted">{d.referencia}</span>}
                </span>
              </p>
            )}
            <p className="flex items-center gap-2 text-muted">
              <Clock className="size-4 shrink-0" aria-hidden />
              {t.seguimientoPedidoA(horaPedido)}
              {d.tiempoEstimadoMin && !terminado
                ? ` · ${t.seguimientoListoEn(d.tiempoEstimadoMin)}`
                : ''}
            </p>
          </section>

          {q.data.fidelidad && d.etapa !== 'RECHAZADO' && <TarjetaSellos f={q.data.fidelidad} />}

          <div className="flex flex-col gap-2">
            <Link
              to={`/r/${r.slug}`}
              className="flex h-12 items-center justify-center rounded-md bg-purple font-semibold text-on-accent"
            >
              {t.hacerOtroPedido}
            </Link>
            {d.etapa !== 'RECHAZADO' && (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(comprobante)}`}
                target="_blank"
                rel="noreferrer"
                className={botonSecundario}
              >
                <MessageCircle className="size-4" aria-hidden /> {t.enviarWhatsApp}
              </a>
            )}
            {r.telefono && (
              <a href={`tel:${r.telefono.replace(/[^0-9+]/g, '')}`} className={botonSecundario}>
                <Phone className="size-4" aria-hidden /> {t.llamarRestaurante}
              </a>
            )}
          </div>
          <p className="text-center text-xs text-muted">
            <Pastilla tono="purple">{t.guardeEnlace}</Pastilla>
          </p>
        </aside>
      </div>
    </Main>
  );
}
