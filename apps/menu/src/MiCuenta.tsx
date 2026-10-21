import type { CuentaDetalle, EstadoItem, Idioma } from '@menu-qr/shared';
import { TEXTOS } from './i18n';

const COLOR_ESTADO: Record<EstadoItem, string> = {
  PENDIENTE: 'bg-stone-100 text-stone-700',
  EN_PREPARACION: 'bg-amber-100 text-amber-900',
  LISTO: 'bg-emerald-100 text-emerald-900',
  ENTREGADO: 'bg-stone-200 text-stone-600',
};

type Props = {
  cuenta: CuentaDetalle;
  lang: Idioma;
  precio: (c: number) => string;
  porcentajes: { iva: number; servicio: number };
};

export function MiCuenta({ cuenta, lang, precio, porcentajes }: Props) {
  const t = TEXTOS[lang];
  const pendiente = cuenta.pedidos.some((p) => p.estado === 'PENDIENTE');
  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-CR', {
      hour: 'numeric',
      minute: '2-digit',
    });

  return (
    <div className="space-y-4 px-4 pt-4">
      {pendiente && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          ⏳ {t.esperandoMesero}
        </p>
      )}
      {cuenta.pedidos.length === 0 && (
        <p className="py-8 text-center text-stone-500">{t.sinPedidos}</p>
      )}

      {cuenta.pedidos.map((p, n) => (
        <section key={p.id} className="rounded-xl border border-stone-200">
          <header className="flex items-center justify-between border-b border-stone-100 px-3 py-2 text-sm">
            <span className="font-medium">
              {t.pedido} {n + 1} · {hora(p.createdAt)}
            </span>
            {p.estado !== 'CONFIRMADO' && (
              <span className="text-xs text-stone-500">
                {p.estado === 'PENDIENTE' ? t.pedidoPendiente : t.pedidoCancelado}
              </span>
            )}
          </header>
          <ul className="divide-y divide-stone-100">
            {p.items.map((i) => (
              <li
                key={i.id}
                className={`flex items-start gap-3 px-3 py-2 text-sm ${i.cancelado ? 'opacity-50' : ''}`}
              >
                <span className="tabular-nums">{i.cantidad}×</span>
                <div className="min-w-0 flex-1">
                  <p className={i.cancelado ? 'line-through' : ''}>
                    {lang === 'en' ? i.nombreEn : i.nombreEs}
                  </p>
                  {i.modificadores.length > 0 && (
                    <p className="text-xs text-stone-500">
                      {i.modificadores
                        .map((m) => (lang === 'en' ? (m.nombreEn ?? m.nombre) : m.nombre))
                        .join(' · ')}
                    </p>
                  )}
                  {i.cancelado && i.motivoCancelacion && (
                    <p className="text-xs text-red-700">
                      {t.cancelado}: {i.motivoCancelacion}
                    </p>
                  )}
                </div>
                {p.estado === 'CONFIRMADO' && !i.cancelado && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[i.estado]}`}
                  >
                    {t.estados[i.estado]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cuenta.total > 0 && (
        <dl className="space-y-1 rounded-xl bg-stone-50 p-3 text-sm">
          <div className="flex justify-between">
            <dt>{t.subtotal}</dt>
            <dd className="tabular-nums">{precio(cuenta.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t.servicio(porcentajes.servicio)}</dt>
            <dd className="tabular-nums">{precio(cuenta.montoServicio)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t.iva(porcentajes.iva)}</dt>
            <dd className="tabular-nums">{precio(cuenta.montoIva)}</dd>
          </div>
          <div className="flex justify-between border-t border-stone-200 pt-1 text-base font-semibold">
            <dt>{t.total}</dt>
            <dd className="tabular-nums">{precio(cuenta.total)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
