import { Bike, Check, MapPin, Navigation, Phone, Store, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CuentaDetalle, MenuPublico } from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import {
  BotonSonido,
  Conexion,
  Encabezado,
  enlacesMapa,
  formatoPrecio,
  hora,
  pedirMotivo,
} from './ui';

type Repartidor = { id: string; nombre: string };

const TIEMPOS = [15, 20, 25, 30, 40, 50, 60];
export const METODOS = [
  { id: 'EFECTIVO', texto: 'Efectivo' },
  { id: 'SINPE', texto: 'SINPE' },
  { id: 'TARJETA', texto: 'Tarjeta' },
] as const;
const ETAPA: Record<string, string> = {
  ACEPTADO: 'Aceptado',
  LISTO: 'Listo para entregar',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  RECHAZADO: 'Rechazado',
};

const boton =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold disabled:opacity-50';

// Progreso en cocina de un pedido aceptado (sale de los ítems).
function progreso(c: CuentaDetalle) {
  const items = c.pedidos.flatMap((p) => p.items).filter((i) => !i.cancelado);
  const listos = items.filter((i) => i.estado === 'LISTO' || i.estado === 'ENTREGADO').length;
  return { listos, total: items.length };
}

function Tarjeta({
  c,
  precio,
  tiempoDefecto,
  onAccion,
  ocupado,
  ahora,
  repartidores,
}: {
  c: CuentaDetalle;
  precio: (n: number) => string;
  tiempoDefecto: number;
  onAccion: (ruta: string, body?: object) => void;
  ocupado: boolean;
  ahora: number;
  repartidores: Repartidor[];
}) {
  const d = c.enLinea!;
  const [tiempo, setTiempo] = useState(tiempoDefecto);
  const [metodo, setMetodo] = useState<string>(d.pagoElegido ?? 'EFECTIVO');
  const base = `/enlinea/${c.id}`;
  const items = c.pedidos.flatMap((p) => p.items);
  const nota = c.pedidos.find((p) => p.nota)?.nota;
  const p = progreso(c);
  const domicilio = c.tipo === 'DOMICILIO';
  const nuevo = d.etapa === 'RECIBIDO';
  const terminado = d.etapa === 'ENTREGADO' || d.etapa === 'RECHAZADO';
  // SINPE sin verificar: no pasa a cocina; minutos que le quedan al cliente para pagar.
  const esperaPago = d.pagoElegido === 'SINPE' && !d.pagoVerificado && !terminado;
  const quedan = d.pagarAntesDe ? Math.ceil((Date.parse(d.pagarAntesDe) - ahora) / 60_000) : null;
  const vencido = esperaPago && quedan !== null && quedan <= 0;

  return (
    <article
      className={`anim-entrar rounded-lg border-2 bg-app p-4 shadow-tarjeta ${nuevo ? 'border-amber' : terminado ? 'border-transparent opacity-75' : 'border-transparent'}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold">
            {domicilio ? (
              <Bike className="size-5 text-purple" aria-hidden />
            ) : (
              <Store className="size-5 text-purple" aria-hidden />
            )}
            #{d.numero} · {d.clienteNombre}
          </p>
          <p className="text-xs text-muted">
            {domicilio ? 'A domicilio' : 'Para recoger'} · pedido a las {hora(c.abiertaEn)}
            {d.tiempoEstimadoMin && !terminado ? ` · listo en ~${d.tiempoEstimadoMin} min` : ''}
          </p>
        </div>
        <span className="text-lg font-bold tabular-nums">{precio(c.total)}</span>
      </header>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a
          href={`tel:${d.clienteTelefono.replace(/[^0-9+]/g, '')}`}
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-purple"
        >
          <Phone className="size-4" aria-hidden /> {d.clienteTelefono}
        </a>
        {domicilio && d.direccion && (
          <a
            href={enlacesMapa(d).google}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-fg"
          >
            <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
            {d.direccion}
            {d.referencia && <span className="text-muted"> · {d.referencia}</span>}
            {d.ubicacion && (
              <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info">
                <Navigation className="size-3" aria-hidden /> punto en el mapa
              </span>
            )}
          </a>
        )}
      </div>
      {domicilio && (d.repartidor || (!nuevo && !terminado)) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <Bike className="size-4 text-muted" aria-hidden />
          {d.etapa === 'ACEPTADO' || d.etapa === 'LISTO' ? (
            repartidores.length ? (
              <select
                value={d.repartidor?.id ?? ''}
                disabled={ocupado}
                onChange={(e) =>
                  e.target.value && onAccion(`${base}/repartidor`, { repartidorId: e.target.value })
                }
                aria-label="Repartidor"
                className="min-h-11 rounded-md border border-line bg-surface px-2"
              >
                <option value="">Elegir repartidor…</option>
                {repartidores.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-muted">
                Sin repartidores: el dueño los crea en Panel → Personal.
              </span>
            )
          ) : (
            <span>
              Repartidor: <strong>{d.repartidor?.nombre ?? 'sin asignar'}</strong>
            </span>
          )}
        </div>
      )}

      <ul className="mt-2 space-y-0.5 text-sm">
        {items.map((i) => (
          <li key={i.id} className={i.cancelado ? 'line-through opacity-50' : ''}>
            <span className="font-medium tabular-nums">{i.cantidad}×</span> {i.nombreEs}
            {i.modificadores.length > 0 && (
              <span className="text-muted">
                {' '}
                · {i.modificadores.map((m) => m.nombre).join(', ')}
              </span>
            )}
            {i.notas && (
              <span className="ml-1 rounded-sm bg-amber-soft px-1 text-amber-ink">{i.notas}</span>
            )}
          </li>
        ))}
      </ul>
      {nota && (
        <p className="mt-2 rounded-md bg-amber-soft px-3 py-2 text-sm text-amber-ink">
          Nota: {nota}
        </p>
      )}

      <p className="mt-2 text-sm">
        Pago: <strong>{d.pagoElegido === 'SINPE' ? 'SINPE Móvil' : 'Efectivo'}</strong>
        {d.comprobanteSinpe && (
          <span className="text-muted"> · comprobante {d.comprobanteSinpe}</span>
        )}
        {d.pagoElegido === 'SINPE' && (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${d.pagoVerificado ? 'bg-ok-soft text-ok' : vencido ? 'bg-danger-soft text-danger' : 'bg-amber-soft text-amber-ink'}`}
          >
            {d.pagoVerificado
              ? 'verificado'
              : vencido
                ? 'tiempo para pagar vencido'
                : esperaPago && quedan !== null
                  ? `sin verificar · quedan ${quedan} min`
                  : 'sin verificar'}
          </span>
        )}
        {d.costoEnvio > 0 && <span className="text-muted"> · envío {precio(d.costoEnvio)}</span>}
      </p>

      {/* Acciones según la etapa. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {nuevo && (
          <>
            <label className="text-sm">
              <span className="sr-only">Tiempo estimado</span>
              <select
                value={tiempo}
                onChange={(e) => setTiempo(Number(e.target.value))}
                className="min-h-11 rounded-md border border-line bg-surface px-2"
              >
                {[...new Set([tiempoDefecto, ...TIEMPOS])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      Listo en {m} min
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onAccion(`${base}/aceptar`, { tiempoEstimadoMin: tiempo })}
              className={`${boton} bg-purple text-on-accent`}
            >
              <Check className="size-4" aria-hidden /> Aceptar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                const motivo = pedirMotivo('¿Por qué no se puede aceptar? (lo verá el cliente)');
                if (motivo) onAccion(`${base}/rechazar`, { motivo });
              }}
              className={`${boton} bg-surface text-fg hover:bg-surface-2`}
            >
              <X className="size-4" aria-hidden /> Rechazar
            </button>
          </>
        )}
        {!nuevo && !terminado && (
          <>
            <span className="mr-auto text-sm text-muted">
              {esperaPago
                ? 'Aceptado · esperando el SINPE (no ha pasado a cocina)'
                : `${ETAPA[d.etapa]} · cocina ${p.listos}/${p.total} listos`}
            </span>
            {d.pagoElegido === 'SINPE' && !d.pagoVerificado && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onAccion(`${base}/pago-verificado`)}
                className={`${boton} bg-amber text-on-amber`}
              >
                Pago verificado
              </button>
            )}
            {esperaPago && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  const motivo = pedirMotivo(
                    '¿Cancelar el pedido? Escriba el motivo (lo verá el cliente)',
                    'No recibimos el pago por SINPE',
                  );
                  if (motivo) onAccion(`${base}/rechazar`, { motivo });
                }}
                className={`${boton} ${vencido ? 'bg-danger text-on-accent' : 'bg-surface text-fg hover:bg-surface-2'}`}
              >
                <X className="size-4" aria-hidden /> Cancelar
              </button>
            )}
            {d.etapa === 'ACEPTADO' && !esperaPago && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onAccion(`${base}/etapa`, { etapa: 'LISTO' })}
                className={`${boton} bg-surface text-fg hover:bg-surface-2`}
              >
                Listo para entregar
              </button>
            )}
            {d.etapa === 'LISTO' && domicilio && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onAccion(`${base}/etapa`, { etapa: 'EN_CAMINO' })}
                className={`${boton} bg-surface text-fg hover:bg-surface-2`}
              >
                <Bike className="size-4" aria-hidden /> Salió a entregar
              </button>
            )}
            {!esperaPago && (
              <span className="flex items-center gap-1">
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                  aria-label="Método de pago"
                  className="min-h-11 rounded-md border border-line bg-surface px-2 text-sm"
                >
                  {METODOS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.texto}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    confirm(`¿Entregado y cobrado (${precio(c.total)})?`) &&
                    onAccion(`${base}/entregar`, { metodoPago: metodo })
                  }
                  className={`${boton} bg-ok text-on-accent`}
                >
                  Entregado y cobrado
                </button>
              </span>
            )}
          </>
        )}
        {terminado && (
          <span
            className={`text-sm font-semibold ${d.etapa === 'RECHAZADO' ? 'text-danger' : 'text-ok'}`}
          >
            {ETAPA[d.etapa]}
            {d.motivoRechazo ? `: ${d.motivoRechazo}` : ''}
            {c.metodoPago ? ` · ${c.metodoPago.toLowerCase()}` : ''}
          </span>
        )}
      </div>
    </article>
  );
}

export function EnLineaPage() {
  const { usuario } = useAuth();
  const [cuentas, setCuentas] = useState<CuentaDetalle[] | null>(null);
  const [menu, setMenu] = useState<MenuPublico>();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const [repartidores, setRepartidores] = useState<Repartidor[]>([]);
  useEffect(() => {
    api<Repartidor[]>('/enlinea/repartidores').then(setRepartidores, () => {});
  }, []);
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(reloj);
  }, []);
  const slug = usuario?.restaurante?.slug ?? '';

  useEffect(() => {
    if (slug) obtenerMenu(slug).then(setMenu, () => {});
  }, [slug]);
  const precio = formatoPrecio(menu?.restaurante.moneda ?? 'CRC');

  const cargar = useCallback(async () => {
    try {
      setCuentas(await api<CuentaDetalle[]>('/enlinea'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const refrescar = useRefrescoAgrupado(cargar);
  const conectado = useTiempoReal(
    {
      // El sonido de los pedidos nuevos lo da AvisosGlobales; aquí solo se refresca.
      'enlinea:nuevo': refrescar,
      'enlinea:actualizado': refrescar,
      'item:estado': refrescar,
      'pedido:confirmado': refrescar,
    },
    cargar,
  );

  const accion = async (ruta: string, body?: object) => {
    setOcupado(true);
    try {
      await api(ruta, { method: 'POST', body });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
      refrescar();
    }
  };

  const lista = cuentas ?? [];
  const nuevos = lista.filter((c) => c.enLinea?.etapa === 'RECIBIDO');
  const enCurso = lista.filter((c) =>
    ['ACEPTADO', 'LISTO', 'EN_CAMINO'].includes(c.enLinea?.etapa ?? ''),
  );
  const hechos = lista.filter((c) => ['ENTREGADO', 'RECHAZADO'].includes(c.enLinea?.etapa ?? ''));
  const tiempoDefecto = menu?.restaurante.enLinea.tiempoEstimadoMin ?? 25;
  const seccion = (titulo: string, items: CuentaDetalle[], vacio: string) => (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="flex items-center justify-between px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        {titulo}
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs tabular-nums">
          {items.length}
        </span>
      </h2>
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
          {vacio}
        </p>
      )}
      {items.map((c) => (
        <Tarjeta
          key={c.id}
          c={c}
          precio={precio}
          tiempoDefecto={tiempoDefecto}
          onAccion={accion}
          ocupado={ocupado}
          ahora={ahora}
          repartidores={repartidores}
        />
      ))}
    </section>
  );

  return (
    <div className="min-h-dvh bg-bg">
      <Encabezado titulo="Pedidos en línea">
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>
      {error && (
        <p role="alert" className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {menu && !menu.restaurante.enLinea.activo && (
        <p className="m-3 rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
          Los pedidos en línea están desactivados. El dueño los activa en Panel → Ajustes.
        </p>
      )}
      {!cuentas ? (
        <div className="m-3 esqueleto h-60 rounded-lg" aria-busy="true" />
      ) : (
        <main className="grid items-start gap-4 p-3 lg:grid-cols-3">
          {seccion('Nuevos', nuevos, 'Sin pedidos nuevos')}
          {seccion('En curso', enCurso, 'Nada en curso')}
          {seccion('Terminados hoy', hechos, 'Todavía nada')}
        </main>
      )}
    </div>
  );
}
