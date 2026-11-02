import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Power, Search, X } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import {
  montoSugerido,
  PLANES,
  type AdminRestauranteDetalle,
  type AdminRestauranteFila,
  type AdminResumen,
  type EstadoSuscripcion,
  type Plan,
} from '@menu-qr/shared';
import { api, type ErrorApi } from './api';
import { Boton, Campo, ErrorCarga, Esqueleto, EstadoVacio } from './panel/comunes';
import { aCentimos, aColones } from './panel/menu/PlatoForm';
import { Encabezado, formatoPrecio } from './ui';

const precio = formatoPrecio('CRC');
const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const ESTADOS: Record<EstadoSuscripcion, { texto: string; tono: string }> = {
  PRUEBA: { texto: 'En prueba', tono: 'bg-info-soft text-info' },
  AL_DIA: { texto: 'Al día', tono: 'bg-ok-soft text-ok' },
  POR_VENCER: { texto: 'Por vencer', tono: 'bg-amber-soft text-amber-ink' },
  VENCIDO: { texto: 'Vencido', tono: 'bg-danger-soft text-danger' },
  SUSPENDIDO: { texto: 'Suspendido', tono: 'bg-surface-2 text-muted' },
};
const METODOS = [
  { id: 'SINPE', texto: 'SINPE Móvil' },
  { id: 'TRANSFERENCIA', texto: 'Transferencia' },
  { id: 'EFECTIVO', texto: 'Efectivo' },
  { id: 'OTRO', texto: 'Otro' },
] as const;
const MESES = [1, 3, 6, 12];

function Estado({ e }: { e: EstadoSuscripcion }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADOS[e].tono}`}>
      {ESTADOS[e].texto}
    </span>
  );
}

function Resumen({ r }: { r: AdminResumen }) {
  const cifra = (titulo: string, valor: string, nota?: string) => (
    <div className="rounded-lg bg-app p-4 shadow-tarjeta">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
      {nota && <p className="text-xs text-muted">{nota}</p>}
    </div>
  );
  return (
    <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cifra('Restaurantes', String(r.restaurantes), `${r.porEstado.PRUEBA} en prueba`)}
      {cifra('Ingreso mensual', precio(r.mensualRecurrente), 'de los que están al día')}
      {cifra('Cobrado este mes', precio(r.ingresosMes))}
      {cifra(
        'Requieren atención',
        String(r.porEstado.POR_VENCER + r.porEstado.VENCIDO),
        `${r.porEstado.POR_VENCER} por vencer · ${r.porEstado.VENCIDO} vencidos`,
      )}
    </section>
  );
}

// Detalle de un restaurante: plan, pagos, suspender y contraseña del dueño.
function Detalle({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({
    queryKey: ['admin', 'restaurante', id],
    queryFn: () => api<AdminRestauranteDetalle>(`/admin/restaurantes/${id}`),
  });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [meses, setMeses] = useState(1);
  const [monto, setMonto] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]['id']>('SINPE');
  const [referencia, setReferencia] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [temporal, setTemporal] = useState<{ email: string; passwordTemporal: string } | null>(
    null,
  );

  const refrescar = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const accion = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refrescar,
    onError: (e: ErrorApi) => setAviso({ ok: false, texto: e.message }),
  });

  if (d.isError)
    return (
      <ErrorCarga mensaje="No se pudo cargar el restaurante" onReintentar={() => d.refetch()} />
    );
  if (!d.data) return <Esqueleto className="h-96" />;
  const r = d.data;
  const planPago = plan ?? r.plan;
  const sugerido = montoSugerido(planPago, meses);
  const montoTexto = monto ?? aColones(sugerido);

  const pagar = () => {
    const centimos = aCentimos(montoTexto);
    if (centimos === null || centimos <= 0)
      return setAviso({ ok: false, texto: 'Escriba el monto en colones' });
    accion.mutate(async () => {
      await api(`/admin/restaurantes/${id}/pagos`, {
        method: 'POST',
        body: {
          plan: planPago,
          meses,
          monto: centimos,
          metodo,
          referencia: referencia.trim() || undefined,
        },
      });
      setMonto(null);
      setReferencia('');
      setAviso({ ok: true, texto: 'Pago registrado' });
    });
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{r.nombre}</h2>
          <p className="text-sm text-muted">
            /{r.slug} · registrado el {fecha(r.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-surface"
        >
          <X className="size-5" aria-hidden />
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Dueño</dt>
          <dd className="font-medium">{r.dueno?.nombre ?? '—'}</dd>
          <dd className="break-all text-muted">{r.dueno?.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Teléfono</dt>
          <dd>{r.telefono ?? '—'}</dd>
          <dd className="text-muted">{r.direccion}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Plan</dt>
          <dd className="flex items-center gap-2 font-medium">
            {PLANES[r.plan].nombre} <Estado e={r.estado} />
          </dd>
          <dd className="text-muted">Vence el {fecha(r.planVenceEn)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Uso</dt>
          <dd>
            {r.pedidos30d} pedidos en 30 días · {r.mesas} mesas · {r.platos} platos · {r.usuarios}{' '}
            usuarios
          </dd>
        </div>
      </dl>

      {aviso && (
        <p
          role="status"
          className={`rounded-md p-3 text-sm ${aviso.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
        >
          {aviso.texto}
        </p>
      )}

      <section className="space-y-3 rounded-lg border border-line p-4">
        <h3 className="font-semibold">Registrar pago</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Plan</span>
            <select
              value={planPago}
              onChange={(e) => {
                setPlan(e.target.value as Plan);
                setMonto(null);
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-2"
            >
              {(Object.keys(PLANES) as Plan[]).map((p) => (
                <option key={p} value={p}>
                  {PLANES[p].nombre} · {precio(PLANES[p].mensual)}/mes
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Meses</span>
            <select
              value={meses}
              onChange={(e) => {
                setMeses(Number(e.target.value));
                setMonto(null);
              }}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-2"
            >
              {MESES.map((m) => (
                <option key={m} value={m}>
                  {m === 12 ? '12 meses (anual, 2 gratis)' : `${m} ${m === 1 ? 'mes' : 'meses'}`}
                </option>
              ))}
            </select>
          </label>
          <Campo
            etiqueta="Monto (₡)"
            inputMode="decimal"
            value={montoTexto}
            onChange={(e) => setMonto(e.target.value)}
            ayuda={`Sugerido: ${precio(sugerido)}`}
          />
          <label className="text-sm">
            <span className="font-medium">Método</span>
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as typeof metodo)}
              className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-2"
            >
              {METODOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.texto}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Campo
          etiqueta="Referencia (opcional)"
          placeholder="Número de comprobante SINPE"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
        <Boton onClick={pagar} disabled={accion.isPending}>
          Registrar pago
        </Boton>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Pagos</h3>
        {r.pagos.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no ha pagado (está en su mes de prueba o venció).
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line text-sm">
            {r.pagos.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  <span className="font-medium">{precio(p.monto)}</span> · {PLANES[p.plan].nombre} ·{' '}
                  {p.meses} {p.meses === 1 ? 'mes' : 'meses'}
                  <span className="block text-xs text-muted">
                    {p.metodo.toLowerCase()}
                    {p.referencia ? ` · ${p.referencia}` : ''} · cubre {fecha(p.desde)} →{' '}
                    {fecha(p.hasta)}
                  </span>
                </span>
                <span className="text-xs text-muted">{fecha(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Boton
          variante={r.estado === 'SUSPENDIDO' ? 'principal' : 'peligro'}
          disabled={accion.isPending}
          onClick={() =>
            confirm(
              r.estado === 'SUSPENDIDO'
                ? `¿Reactivar ${r.nombre}?`
                : `¿Suspender ${r.nombre}? Nadie del restaurante podrá entrar y su menú no abrirá.`,
            ) &&
            accion.mutate(() =>
              api(`/admin/restaurantes/${id}`, {
                method: 'PATCH',
                body: { activo: r.estado === 'SUSPENDIDO' },
              }),
            )
          }
        >
          <Power className="size-4" aria-hidden />
          {r.estado === 'SUSPENDIDO' ? 'Reactivar' : 'Suspender'}
        </Boton>
        <Boton
          variante="suave"
          disabled={accion.isPending || !r.dueno}
          onClick={() =>
            confirm(`¿Crear una contraseña temporal para ${r.dueno?.email}?`) &&
            accion.mutate(async () =>
              setTemporal(
                await api<{ email: string; passwordTemporal: string }>(
                  `/admin/restaurantes/${id}/restablecer-dueno`,
                  { method: 'POST' },
                ),
              ),
            )
          }
        >
          <KeyRound className="size-4" aria-hidden /> Contraseña del dueño
        </Boton>
      </section>
      {temporal && (
        <p role="status" className="rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
          Contraseña temporal de {temporal.email}:{' '}
          <strong className="font-mono text-base select-all">{temporal.passwordTemporal}</strong>.
          Se muestra una sola vez; al entrar deberá cambiarla.
        </p>
      )}
    </div>
  );
}

// /admin: el dueño de la plataforma (superadmin).
export function AdminPage() {
  const [buscar, setBuscar] = useState('');
  const termino = useDeferredValue(buscar.trim());
  const [estado, setEstado] = useState<EstadoSuscripcion | ''>('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const resumen = useQuery({
    queryKey: ['admin', 'resumen'],
    queryFn: () => api<AdminResumen>('/admin/resumen'),
  });
  const lista = useQuery({
    queryKey: ['admin', 'restaurantes', termino, estado],
    queryFn: () => {
      const q = new URLSearchParams();
      if (termino) q.set('buscar', termino);
      if (estado) q.set('estado', estado);
      return api<AdminRestauranteFila[]>(`/admin/restaurantes?${q}`);
    },
    placeholderData: (previo) => previo,
  });

  return (
    <div className="min-h-dvh bg-bg">
      <Encabezado titulo="Administración de la plataforma" />
      <main className="mx-auto max-w-6xl space-y-5 p-4">
        {resumen.data && <Resumen r={resumen.data} />}

        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-11 min-w-60 flex-1 items-center gap-2 rounded-md border border-line bg-app px-3">
            <Search className="size-4 text-muted" aria-hidden />
            <span className="sr-only">Buscar</span>
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por nombre, enlace o correo del dueño"
              className="h-11 flex-1 bg-transparent outline-none"
            />
          </label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoSuscripcion | '')}
            aria-label="Filtrar por estado"
            className="min-h-11 rounded-md border border-line bg-app px-3 text-sm"
          >
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADOS) as EstadoSuscripcion[]).map((e) => (
              <option key={e} value={e}>
                {ESTADOS[e].texto}
              </option>
            ))}
          </select>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1fr_440px]">
          {lista.isError ? (
            <ErrorCarga mensaje="No se pudo cargar la lista" onReintentar={() => lista.refetch()} />
          ) : !lista.data ? (
            <Esqueleto className="h-60" />
          ) : lista.data.length === 0 ? (
            <EstadoVacio
              titulo="Sin restaurantes"
              detalle="Ninguno coincide con la búsqueda o el filtro."
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-app">
              {lista.data.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setAbierto(r.id)}
                    aria-pressed={abierto === r.id}
                    className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left hover:bg-surface ${abierto === r.id ? 'bg-surface' : ''}`}
                  >
                    <span className="min-w-48 flex-1">
                      <span className="block font-semibold">{r.nombre}</span>
                      <span className="block text-xs text-muted">
                        {r.dueno?.email ?? 'sin dueño'}
                      </span>
                    </span>
                    <span className="text-sm">{PLANES[r.plan].nombre}</span>
                    <span className="w-28 text-xs text-muted">Vence {fecha(r.planVenceEn)}</span>
                    <span className="w-24 text-xs text-muted">{r.pedidos30d} pedidos/30 d</span>
                    <Estado e={r.estado} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {abierto && (
            <aside className="rounded-lg bg-app p-5 shadow-tarjeta lg:sticky lg:top-20">
              <Detalle key={abierto} id={abierto} onCerrar={() => setAbierto(null)} />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
