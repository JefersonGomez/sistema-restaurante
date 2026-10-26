import { useQuery } from '@tanstack/react-query';
import { Check, Phone, Utensils } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { CuentaDetalle, EtapaEnLinea } from '@menu-qr/shared';
import { Cargando, formatoPrecio, nombreEn, Pastilla } from '@menu-qr/ui';
import * as api from '../api';
import { TotalsSummary } from '../componentes/cuenta';
import { ErrorScreen, Main } from '../componentes/estructura';
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

  return (
    <Main>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center gap-3">
          {r.logoUrl && (
            <img src={r.logoUrl} alt="" className="size-14 rounded-full bg-surface object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold">{r.nombre}</h1>
            <p className="text-sm text-muted">
              {t.pedidoNumero(d.numero)} · {c.tipo === 'DOMICILIO' ? t.aDomicilio : t.paraRecoger}
            </p>
          </div>
        </div>

        {/* Estado actual, grande. */}
        <div
          role="status"
          className={`anim-entrar rounded-lg p-5 text-center ${d.etapa === 'RECHAZADO' ? 'bg-danger-soft text-danger' : d.etapa === 'ENTREGADO' ? 'bg-ok-soft text-ok' : 'bg-purple-soft text-purple'}`}
        >
          <Utensils className="mx-auto mb-2 size-8" aria-hidden />
          <p className="text-lg font-semibold text-balance">{texto[d.etapa]}</p>
        </div>

        {d.etapa !== 'RECHAZADO' && (
          <ol className="flex flex-col gap-2" aria-label={t.suPedido}>
            {pasos.map((p, i) => {
              const hecho = i < actual || d.etapa === 'ENTREGADO';
              const ahora = i === actual && d.etapa !== 'ENTREGADO';
              return (
                <li key={p} className="flex items-center gap-3">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${hecho ? 'bg-ok text-on-accent' : ahora ? 'bg-purple text-on-accent' : 'bg-surface-2 text-muted'}`}
                  >
                    {hecho ? <Check className="size-4" aria-hidden /> : i + 1}
                  </span>
                  <span
                    className={`text-sm ${ahora ? 'font-semibold' : hecho ? '' : 'text-muted'}`}
                  >
                    {texto[p]}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {d.pagoElegido === 'SINPE' && d.etapa !== 'RECHAZADO' && (
          <p className="rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
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

        <ul className="divide-y divide-line rounded-md bg-surface px-4 text-sm">
          {items.map((i) => (
            <li
              key={i.id}
              className={`flex items-center gap-2 py-2.5 ${i.cancelado ? 'opacity-50' : ''}`}
            >
              <span className="tabular-nums">{i.cantidad}×</span>
              <span className="min-w-0 flex-1">
                {nombreEn(i, idioma)}
                {i.modificadores.length > 0 && (
                  <span className="text-muted">
                    {' '}
                    ·{' '}
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

        <div className="flex flex-col gap-2">
          {r.telefono && (
            <a
              href={`tel:${r.telefono.replace(/[^0-9+]/g, '')}`}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-surface font-semibold"
            >
              <Phone className="size-4" aria-hidden /> {t.llamarRestaurante}
            </a>
          )}
          <Link
            to={`/r/${r.slug}`}
            className="flex h-12 items-center justify-center rounded-md bg-purple font-semibold text-on-accent"
          >
            {t.hacerOtroPedido}
          </Link>
        </div>
        <p className="text-center text-xs text-muted">
          <Pastilla tono="purple">{t.guardeEnlace}</Pastilla>
        </p>
      </div>
    </Main>
  );
}
