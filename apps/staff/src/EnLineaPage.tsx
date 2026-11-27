import { Bike, Gift, MapPin, Navigation, Phone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CuentaDetalle, MenuPublico } from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { BotonSonido, Conexion, Encabezado, enlacesMapa, formatoPrecio, hora } from './ui';
import { confirmar, pedirMotivo } from './dialogos';

// Pedidos en línea (Fase 20.8, simplificado): una cuadrícula ordenada por lo que hay que hacer y
// un botón principal por tarjeta. La cocina pasa el pedido a "Listo" sola al despacharlo.
type Repartidor = { id: string; nombre: string };

const TIEMPOS = [15, 20, 25, 30, 40, 50, 60];
const RESPONDER_MS = 5 * 60_000; // un pedido nuevo debería responderse en este tiempo
export const METODOS = [
  { id: 'EFECTIVO', texto: 'Efectivo' },
  { id: 'SINPE', texto: 'SINPE' },
  { id: 'TARJETA', texto: 'Tarjeta' },
] as const;

const boton =
  'inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg px-4 text-[15px] font-bold disabled:opacity-50';
const secundario =
  'inline-flex min-h-12 items-center justify-center rounded-lg px-3 text-sm font-semibold text-muted hover:bg-surface-2 disabled:opacity-50';
const selector = 'min-h-12 rounded-lg border border-line bg-surface px-2 text-sm';

const esperaSinpe = (c: CuentaDetalle) =>
  c.enLinea!.pagoElegido === 'SINPE' && !c.enLinea!.pagoVerificado;
const etapa = (c: CuentaDetalle) => c.enLinea?.etapa ?? '';
// Orden de la cuadrícula: lo que necesita a la caja primero.
const prioridad = (c: CuentaDetalle) =>
  etapa(c) === 'RECIBIDO'
    ? 0
    : esperaSinpe(c)
      ? 1
      : etapa(c) === 'LISTO'
        ? 2
        : etapa(c) === 'ACEPTADO'
          ? 3
          : 4;

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
  const items = c.pedidos.flatMap((p) => p.items).filter((i) => !i.cancelado);
  const nota = c.pedidos.find((p) => p.nota)?.nota;
  const domicilio = c.tipo === 'DOMICILIO';
  const nuevo = d.etapa === 'RECIBIDO';
  const esperaPago = esperaSinpe(c);
  const quedan = d.pagarAntesDe ? Math.ceil((Date.parse(d.pagarAntesDe) - ahora) / 60_000) : null;
  const vencido = esperaPago && quedan !== null && quedan <= 0;
  const porEntregar = !esperaPago && (d.etapa === 'LISTO' || d.etapa === 'EN_CAMINO');

  // Tiempo como en la cocina: un nuevo se mide contra 5 min; aceptado, contra lo prometido.
  const edad = ahora - Date.parse(c.abiertaEn);
  const limite = nuevo ? RESPONDER_MS : (d.tiempoEstimadoMin ?? tiempoDefecto) * 60_000;
  const [linea, pildora] =
    d.etapa === 'EN_CAMINO' || d.etapa === 'LISTO'
      ? ['border-t-ok', 'bg-ok-soft text-ok']
      : edad > limite
        ? ['border-t-danger', 'bg-danger text-bg']
        : nuevo
          ? ['border-t-info', 'bg-info-soft text-info']
          : edad > limite * 0.7
            ? ['border-t-amber', 'bg-amber text-bg']
            : ['border-t-line', 'bg-surface-2 text-fg'];

  const estado = nuevo
    ? edad > RESPONDER_MS
      ? 'Por aceptar · el cliente está esperando respuesta'
      : 'Por aceptar'
    : esperaPago
      ? vencido
        ? 'SINPE sin pagar: se venció el tiempo'
        : `Esperando el SINPE${quedan !== null ? ` · quedan ${quedan} min` : ''}${d.comprobanteSinpe ? ` · comprobante ${d.comprobanteSinpe}` : ''}`
      : d.etapa === 'ACEPTADO'
        ? `En cocina${d.tiempoEstimadoMin ? ` · prometido en ${d.tiempoEstimadoMin} min` : ''}`
        : d.etapa === 'LISTO'
          ? domicilio
            ? d.repartidor
              ? `Listo · lo lleva ${d.repartidor.nombre}`
              : 'Listo para enviar'
            : 'Listo: el cliente pasa a recogerlo'
          : `En camino${d.repartidor ? ` con ${d.repartidor.nombre}` : ''}`;

  return (
    <article
      className={`anim-entrar flex flex-col overflow-hidden rounded-xl border border-t-4 border-line bg-app ${linea}`}
    >
      <header className="flex items-center gap-2 px-3.5 pt-2.5">
        <h3 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold">
          #{d.numero} · {d.clienteNombre}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${pildora}`}
        >
          {Math.floor(edad / 60_000)} min
        </span>
      </header>
      <p className="px-3.5 text-xs text-muted">
        {domicilio ? 'A domicilio' : 'Para recoger'} · {hora(c.abiertaEn)} ·{' '}
        <span className="font-semibold text-fg tabular-nums">{precio(c.total)}</span>
        {' · '}
        {d.pagoElegido === 'SINPE' ? 'SINPE' : 'Efectivo'}
      </p>
      <p className={`px-3.5 pt-1.5 text-sm font-semibold ${vencido ? 'text-danger' : ''}`}>
        {estado}
      </p>

      <div className="flex flex-col gap-1.5 px-3.5 py-2.5 text-sm">
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <span className="font-bold tabular-nums">{i.cantidad}×</span> {i.nombreEs}
              {i.modificadores.length > 0 && (
                <span className="text-muted">
                  {' '}
                  · {i.modificadores.map((m) => m.nombre).join(', ')}
                </span>
              )}
              {i.notas && (
                <span className="ml-1 rounded bg-amber-soft px-1.5 font-semibold text-amber-ink">
                  {i.notas}
                </span>
              )}
            </li>
          ))}
        </ul>
        {nota && (
          <p className="rounded-md bg-amber-soft px-2.5 py-1 font-semibold text-amber-ink">
            {nota}
          </p>
        )}
        <a
          href={`tel:${d.clienteTelefono.replace(/[^0-9+]/g, '')}`}
          className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-info"
        >
          <Phone className="size-4" aria-hidden /> {d.clienteTelefono}
        </a>
        {domicilio && d.direccion && (
          <a
            href={enlacesMapa(d).google}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-start gap-1.5"
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              {d.direccion}
              {d.referencia && <span className="text-muted"> · {d.referencia}</span>}
              {d.ubicacion && (
                <Navigation
                  className="ml-1 inline size-3.5 text-info"
                  aria-label="Con punto en el mapa"
                />
              )}
            </span>
          </a>
        )}
        {d.fidelidad && d.fidelidad.sellos >= d.fidelidad.meta && (
          <button
            type="button"
            disabled={ocupado}
            onClick={async () =>
              (await confirmar(`¿Canjear «${d.fidelidad!.premio}» para ${d.clienteNombre}?`, {
                boton: 'Canjear',
              })) && onAccion('/clientes/canjear', { telefono: d.clienteTelefono })
            }
            className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-md bg-ok-soft px-2.5 font-semibold text-ok"
          >
            <Gift className="size-4" aria-hidden /> Tiene premio: {d.fidelidad.premio}
          </button>
        )}
      </div>

      {/* Un botón principal según lo que toca hacer. */}
      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-line p-2.5">
        {nuevo && (
          <>
            <select
              value={tiempo}
              onChange={(e) => setTiempo(Number(e.target.value))}
              aria-label="Tiempo estimado"
              className={selector}
            >
              {[...new Set([tiempoDefecto, ...TIEMPOS])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onAccion(`${base}/aceptar`, { tiempoEstimadoMin: tiempo })}
              className={`${boton} flex-1 bg-info text-bg`}
            >
              Aceptar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                const motivo = await pedirMotivo(
                  '¿Por qué no se puede aceptar? Lo verá el cliente.',
                  [
                    'Estamos muy llenos en este momento',
                    'Se acabó un plato del pedido',
                    'No llegamos a esa dirección',
                  ],
                );
                if (motivo) onAccion(`${base}/rechazar`, { motivo });
              }}
              className={secundario}
            >
              Rechazar
            </button>
          </>
        )}
        {!nuevo && esperaPago && (
          <>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onAccion(`${base}/pago-verificado`)}
              className={`${boton} flex-1 bg-amber text-bg`}
            >
              Ya recibí el SINPE
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                const motivo = await pedirMotivo(
                  '¿Por qué se cancela el pedido? Lo verá el cliente.',
                  ['No recibimos el pago por SINPE', 'El cliente pidió cancelar'],
                );
                if (motivo) onAccion(`${base}/rechazar`, { motivo });
              }}
              className={secundario}
            >
              Cancelar
            </button>
          </>
        )}
        {d.etapa === 'ACEPTADO' && !esperaPago && (
          <>
            <span className="mr-auto text-sm text-muted">
              Pasa a listo cuando la cocina lo despacha
            </span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onAccion(`${base}/etapa`, { etapa: 'LISTO' })}
              className={secundario}
            >
              Ya está listo
            </button>
          </>
        )}
        {porEntregar && (
          <>
            {domicilio && d.etapa === 'LISTO' && repartidores.length > 0 && (
              <label className="flex w-full items-center gap-2 text-sm">
                <Bike className="size-4 shrink-0 text-muted" aria-hidden />
                <select
                  value={d.repartidor?.id ?? ''}
                  disabled={ocupado}
                  onChange={(e) =>
                    e.target.value &&
                    onAccion(`${base}/repartidor`, { repartidorId: e.target.value })
                  }
                  aria-label="Repartidor"
                  className={`${selector} flex-1`}
                >
                  <option value="">¿Quién lo lleva?</option>
                  {repartidores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!d.pagoVerificado && (
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value)}
                aria-label="Cómo pagó"
                className={selector}
              >
                {METODOS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.texto}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={async () =>
                (await confirmar(`¿Entregado y cobrado ${precio(c.total)}?`, {
                  boton: 'Sí, entregado',
                })) &&
                onAccion(`${base}/entregar`, { metodoPago: d.pagoVerificado ? 'SINPE' : metodo })
              }
              className={`${boton} flex-1 ${d.repartidor ? 'bg-surface-2 text-fg' : 'bg-ok text-bg'}`}
            >
              Entregado y cobrado
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

// Terminados: renglón compacto (entregado con método, o rechazado con el motivo).
function Terminado({ c, precio }: { c: CuentaDetalle; precio: (n: number) => string }) {
  const d = c.enLinea!;
  const rechazado = d.etapa === 'RECHAZADO';
  return (
    <li className="flex items-center gap-2 rounded-lg bg-app px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">
        <strong>
          #{d.numero} · {d.clienteNombre}
        </strong>{' '}
        <span className={rechazado ? 'text-danger' : 'text-ok'}>
          {rechazado ? `Rechazado${d.motivoRechazo ? `: ${d.motivoRechazo}` : ''}` : 'Entregado'}
          {c.metodoPago &&
            ` · ${METODOS.find((m) => m.id === c.metodoPago)?.texto.toLowerCase() ?? ''}`}
        </span>
        <span className="text-muted"> · {hora(c.cerradaEn ?? c.abiertaEn)}</span>
      </span>
      <span className="font-semibold tabular-nums">{precio(c.total)}</span>
    </li>
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

  const todas = cuentas ?? [];
  const activas = todas
    .filter((c) => !['ENTREGADO', 'RECHAZADO'].includes(etapa(c)))
    .sort((a, b) => prioridad(a) - prioridad(b) || a.abiertaEn.localeCompare(b.abiertaEn));
  const terminados = todas.filter((c) => ['ENTREGADO', 'RECHAZADO'].includes(etapa(c)));
  const tiempoDefecto = menu?.restaurante.enLinea.tiempoEstimadoMin ?? 25;

  return (
    <div className="tema-operacion min-h-dvh">
      <Encabezado titulo="Pedidos en línea">
        <span className="rounded-full bg-app px-3 py-1.5 text-sm font-semibold tabular-nums">
          {activas.length} {activas.length === 1 ? 'pedido' : 'pedidos'}
        </span>
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>
      {error && (
        <p role="alert" className="mx-3 mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {menu && !menu.restaurante.enLinea.activo && (
        <p className="mx-3 mt-3 rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
          Los pedidos en línea están desactivados. El dueño los activa en Panel → Ajustes.
        </p>
      )}
      {!cuentas ? (
        <div className="m-3 esqueleto h-60 rounded-xl" aria-busy="true" />
      ) : (
        <main className="p-3">
          {activas.length === 0 ? (
            <p className="mt-12 text-center text-muted">
              Sin pedidos en curso. Los nuevos aparecen aquí con un aviso.
            </p>
          ) : (
            <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
              {activas.map((c) => (
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
            </div>
          )}
          {terminados.length > 0 && (
            <details className="mt-6">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-muted">
                Terminados en las últimas 12 h ({terminados.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {terminados.map((c) => (
                  <Terminado key={c.id} c={c} precio={precio} />
                ))}
              </ul>
            </details>
          )}
        </main>
      )}
    </div>
  );
}
