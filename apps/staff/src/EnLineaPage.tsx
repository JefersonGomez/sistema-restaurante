import { Bike, Check, Gift, MapPin, Navigation, Phone, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { tiempoTranscurrido, type CuentaDetalle, type MenuPublico } from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import {
  BotonSonido,
  ColumnaTablero,
  Conexion,
  Encabezado,
  enlacesMapa,
  formatoPrecio,
  hora,
  Kpi,
  pedirMotivo,
  Segmentado,
  tonoTiempo,
} from './ui';

// Pedidos en línea (Fase 10): mismo lenguaje que la cocina. Nuevos → En cocina → Listos y en
// camino → Terminados.
type Repartidor = { id: string; nombre: string };
type Canal = 'TODOS' | 'RECOGER' | 'DOMICILIO';

const TIEMPOS = [15, 20, 25, 30, 40, 50, 60];
const RESPONDER_MS = 5 * 60_000; // un pedido nuevo sin aceptar ni rechazar en este tiempo: rojo
export const METODOS = [
  { id: 'EFECTIVO', texto: 'Efectivo' },
  { id: 'SINPE', texto: 'SINPE' },
  { id: 'TARJETA', texto: 'Tarjeta' },
] as const;
const ETAPA: Record<string, string> = {
  ACEPTADO: 'En cocina',
  LISTO: 'Listo para entregar',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  RECHAZADO: 'Rechazado',
};
const CANAL = {
  RECOGER: { texto: 'Para llevar', clase: 'bg-info-soft text-info' },
  DOMICILIO: { texto: 'A domicilio', clase: 'bg-linea-soft text-linea' },
} as const;

const boton =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-bold disabled:opacity-50';
const selector = 'min-h-11 rounded-[10px] border border-line bg-surface px-2 text-sm';

// Progreso en cocina de un pedido aceptado (sale de los ítems).
function progreso(c: CuentaDetalle) {
  const items = c.pedidos.flatMap((p) => p.items).filter((i) => !i.cancelado);
  const listos = items.filter((i) => i.estado === 'LISTO' || i.estado === 'ENTREGADO').length;
  return { listos, total: items.length };
}
const esperaSinpe = (c: CuentaDetalle) =>
  c.enLinea!.pagoElegido === 'SINPE' && !c.enLinea!.pagoVerificado;

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
  // SINPE sin verificar: no pasa a cocina; minutos que le quedan al cliente para pagar.
  const esperaPago = esperaSinpe(c);
  const quedan = d.pagarAntesDe ? Math.ceil((Date.parse(d.pagarAntesDe) - ahora) / 60_000) : null;
  const vencido = esperaPago && quedan !== null && quedan <= 0;

  // Tiempo: un nuevo debe responderse en 5 min; aceptado, contra el tiempo prometido al cliente.
  const edad = ahora - Date.parse(c.abiertaEn);
  const limite = nuevo ? RESPONDER_MS : (d.tiempoEstimadoMin ?? tiempoDefecto) * 60_000;
  const proporcion = edad / limite;
  const atrasado = proporcion >= 1 && d.etapa !== 'EN_CAMINO';
  const avance =
    d.etapa === 'ACEPTADO' ? (p.total ? p.listos / p.total : 0) : nuevo ? proporcion : 1;
  const barra = atrasado
    ? 'bg-danger'
    : nuevo
      ? 'bg-info'
      : d.etapa === 'ACEPTADO'
        ? 'bg-amber'
        : 'bg-ok';

  return (
    <article
      className={`anim-entrar flex flex-col overflow-hidden rounded-xl bg-app ${
        atrasado
          ? 'border-2 border-danger shadow-[0_0_0_4px_var(--peligro-suave)]'
          : nuevo
            ? 'border-2 border-info'
            : 'border border-line'
      }`}
    >
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-display text-[22px] leading-tight font-extrabold">
              #{d.numero} · {d.clienteNombre}
            </h3>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${CANAL[c.tipo as 'RECOGER'].clase}`}
            >
              {CANAL[c.tipo as 'RECOGER'].texto}
            </span>
            {atrasado && (
              <span className="rounded-md bg-danger px-1.5 py-0.5 text-[11px] font-extrabold tracking-wide text-bg">
                {nuevo ? 'SIN RESPONDER' : 'ATRASADO'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            Pedido a las {hora(c.abiertaEn)}
            {d.tiempoEstimadoMin && !nuevo
              ? ` · prometido en ${d.tiempoEstimadoMin} min`
              : ''} · <span className="font-semibold text-fg tabular-nums">{precio(c.total)}</span>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${d.etapa === 'EN_CAMINO' ? 'bg-ok-soft text-ok' : tonoTiempo(proporcion)}`}
        >
          {tiempoTranscurrido(edad)}
        </span>
      </header>
      <div className="h-1 bg-surface-2" aria-hidden>
        <div className={`h-full ${barra}`} style={{ width: `${Math.min(100, avance * 100)}%` }} />
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-col gap-1 text-sm">
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
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-md bg-info-soft px-1.5 py-0.5 text-xs font-bold text-info">
                    <Navigation className="size-3" aria-hidden /> punto en el mapa
                  </span>
                )}
              </span>
            </a>
          )}
          {domicilio && (d.repartidor || !nuevo) && (
            <div className="flex flex-wrap items-center gap-2">
              <Bike className="size-4 text-muted" aria-hidden />
              {d.etapa === 'ACEPTADO' || d.etapa === 'LISTO' ? (
                repartidores.length ? (
                  <select
                    value={d.repartidor?.id ?? ''}
                    disabled={ocupado}
                    onChange={(e) =>
                      e.target.value &&
                      onAccion(`${base}/repartidor`, { repartidorId: e.target.value })
                    }
                    aria-label="Repartidor"
                    className={selector}
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
        </div>

        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li
              key={i.id}
              className={`flex items-start gap-2 rounded-lg bg-surface px-2.5 py-1.5 ${i.cancelado ? 'line-through opacity-50' : ''}`}
            >
              <span className="font-display font-extrabold text-amber tabular-nums">
                {i.cantidad}×
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{i.nombreEs}</span>
                {i.modificadores.length > 0 && (
                  <span className="text-muted">
                    {' '}
                    · {i.modificadores.map((m) => m.nombre).join(', ')}
                  </span>
                )}
                {i.notas && (
                  <span className="ml-1.5 rounded bg-amber px-1.5 text-xs font-bold text-bg">
                    {i.notas}
                  </span>
                )}
              </span>
              {!nuevo && (
                <Check
                  aria-label={
                    i.estado === 'LISTO' || i.estado === 'ENTREGADO' ? 'Listo' : undefined
                  }
                  className={`mt-0.5 size-4 shrink-0 ${i.estado === 'LISTO' || i.estado === 'ENTREGADO' ? 'text-ok' : 'text-line'}`}
                />
              )}
            </li>
          ))}
        </ul>
        {nota && (
          <p className="rounded-md bg-amber-soft px-2.5 py-1.5 text-sm font-semibold text-amber">
            Nota: {nota}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-muted">
            {d.pagoElegido === 'SINPE' ? 'SINPE Móvil' : 'Efectivo'}
            {d.costoEnvio > 0 ? ` · envío ${precio(d.costoEnvio)}` : ''}
          </span>
          {d.pagoElegido === 'SINPE' && (
            <span
              className={`rounded-md px-1.5 py-0.5 ${d.pagoVerificado ? 'bg-ok-soft text-ok' : vencido ? 'bg-danger text-bg' : 'bg-amber-soft text-amber'}`}
            >
              {d.pagoVerificado
                ? 'Pago verificado'
                : vencido
                  ? 'Tiempo para pagar vencido'
                  : quedan !== null
                    ? `Sin verificar · quedan ${quedan} min`
                    : 'Sin verificar'}
              {d.comprobanteSinpe ? ` · comprobante ${d.comprobanteSinpe}` : ''}
            </span>
          )}
          {d.fidelidad && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${d.fidelidad.sellos >= d.fidelidad.meta ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}
            >
              <Gift className="size-3.5" aria-hidden />
              {Math.min(d.fidelidad.sellos, d.fidelidad.meta)}/{d.fidelidad.meta} sellos
            </span>
          )}
          {d.fidelidad && d.fidelidad.sellos >= d.fidelidad.meta && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                confirm(`¿Canjear «${d.fidelidad!.premio}» para ${d.clienteNombre}?`) &&
                onAccion('/clientes/canjear', { telefono: d.clienteTelefono })
              }
              className="min-h-8 rounded-md bg-ok px-2 text-bg disabled:opacity-50"
            >
              Canjear: {d.fidelidad.premio}
            </button>
          )}
        </div>
      </div>

      {/* Acciones según la etapa. */}
      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-line p-2.5">
        {nuevo ? (
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
                    Listo en {m} min
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onAccion(`${base}/aceptar`, { tiempoEstimadoMin: tiempo })}
              className={`${boton} bg-info text-bg`}
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
              className={`${boton} bg-surface-2 hover:bg-line`}
            >
              <X className="size-4" aria-hidden /> Rechazar
            </button>
          </>
        ) : (
          <>
            <span className="mr-auto text-sm text-muted tabular-nums">
              {esperaPago
                ? 'Esperando el SINPE: no ha pasado a cocina'
                : `Cocina ${p.listos} de ${p.total}`}
            </span>
            {esperaPago && (
              <>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onAccion(`${base}/pago-verificado`)}
                  className={`${boton} bg-amber text-bg`}
                >
                  Pago verificado
                </button>
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
                  className={`${boton} ${vencido ? 'bg-danger text-bg' : 'bg-surface-2 hover:bg-line'}`}
                >
                  <X className="size-4" aria-hidden /> Cancelar
                </button>
              </>
            )}
            {d.etapa === 'ACEPTADO' && !esperaPago && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onAccion(`${base}/etapa`, { etapa: 'LISTO' })}
                // Cocina ya terminó todo: es lo siguiente que hay que hacer.
                className={`${boton} ${p.total > 0 && p.listos === p.total ? 'bg-fg text-bg' : 'bg-surface-2 hover:bg-line'}`}
              >
                Listo para entregar
              </button>
            )}
            {d.etapa === 'LISTO' && domicilio && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onAccion(`${base}/etapa`, { etapa: 'EN_CAMINO' })}
                className={`${boton} bg-surface-2 hover:bg-line`}
              >
                <Bike className="size-4" aria-hidden /> Salió a entregar
              </button>
            )}
            {!esperaPago && (
              <span className="flex items-center gap-1.5">
                <select
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                  aria-label="Método de pago"
                  className={selector}
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
                  className={`${boton} bg-ok text-bg`}
                >
                  Entregado y cobrado
                </button>
              </span>
            )}
          </>
        )}
      </footer>
    </article>
  );
}

// Terminados: fila compacta (entregado con método, o rechazado con el motivo).
function Terminado({ c, precio }: { c: CuentaDetalle; precio: (n: number) => string }) {
  const d = c.enLinea!;
  const rechazado = d.etapa === 'RECHAZADO';
  return (
    <li className="rounded-xl border border-line bg-app p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-display text-base font-extrabold">
          #{d.numero} · {d.clienteNombre}
        </span>
        <span className="text-sm font-semibold tabular-nums">{precio(c.total)}</span>
      </div>
      <p className={`mt-0.5 text-sm font-semibold ${rechazado ? 'text-danger' : 'text-ok'}`}>
        {ETAPA[d.etapa]}
        {d.motivoRechazo ? `: ${d.motivoRechazo}` : ''}
        {c.metodoPago
          ? ` · ${METODOS.find((m) => m.id === c.metodoPago)?.texto.toLowerCase() ?? ''}`
          : ''}
        <span className="font-normal text-muted"> · {hora(c.cerradaEn ?? c.abiertaEn)}</span>
      </p>
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
  const [buscar, setBuscar] = useState('');
  const [canal, setCanal] = useState<Canal>('TODOS');
  useEffect(() => {
    api<Repartidor[]>('/enlinea/repartidores').then(setRepartidores, () => {});
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
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
  const etapa = (c: CuentaDetalle) => c.enLinea?.etapa ?? '';
  const delCanal = todas.filter((c) => canal === 'TODOS' || c.tipo === canal);
  // Buscador: número de pedido, nombre o teléfono.
  const q = buscar.trim().toLowerCase().replace('#', '');
  const digitos = q.replace(/\D/g, '');
  const lista = delCanal.filter(
    (c) =>
      !q ||
      String(c.enLinea?.numero) === q ||
      c.enLinea?.clienteNombre.toLowerCase().includes(q) ||
      (digitos.length > 0 && c.enLinea?.clienteTelefono.replace(/\D/g, '').includes(digitos)),
  );
  const nuevos = lista
    .filter((c) => etapa(c) === 'RECIBIDO')
    .sort((a, b) => a.abiertaEn.localeCompare(b.abiertaEn));
  // En cocina: los que esperan el SINPE arriba (no avanzan hasta verificarlo), luego los más antiguos.
  const enCocina = lista
    .filter((c) => etapa(c) === 'ACEPTADO')
    .sort(
      (a, b) =>
        Number(esperaSinpe(b)) - Number(esperaSinpe(a)) || a.abiertaEn.localeCompare(b.abiertaEn),
    );
  const salida = lista
    .filter((c) => etapa(c) === 'LISTO' || etapa(c) === 'EN_CAMINO')
    .sort((a, b) => a.abiertaEn.localeCompare(b.abiertaEn));
  const terminados = lista.filter((c) => etapa(c) === 'ENTREGADO' || etapa(c) === 'RECHAZADO');

  // KPIs del canal elegido (sin el buscador).
  const cuenta = (f: (c: CuentaDetalle) => boolean) => delCanal.filter(f).length;
  const porVerificar = cuenta((c) => ['RECIBIDO', 'ACEPTADO'].includes(etapa(c)) && esperaSinpe(c));
  const sinResponder = cuenta(
    (c) => etapa(c) === 'RECIBIDO' && ahora - Date.parse(c.abiertaEn) > RESPONDER_MS,
  );
  const tiempoDefecto = menu?.restaurante.enLinea.tiempoEstimadoMin ?? 25;
  const tarjeta = (c: CuentaDetalle) => (
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
  );
  const vacio = (texto: string) => (
    <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
      {q ? 'Nada coincide con la búsqueda' : texto}
    </p>
  );
  const grid = 'grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]';

  return (
    <div className="tema-operacion flex min-h-dvh flex-col lg:h-dvh">
      <Encabezado titulo="Pedidos en línea">
        <Kpi texto="nuevos" valor={cuenta((c) => etapa(c) === 'RECIBIDO')} />
        <Kpi texto="sin responder" valor={sinResponder} alerta={sinResponder > 0} />
        <Kpi texto="en cocina" valor={cuenta((c) => etapa(c) === 'ACEPTADO')} />
        <Kpi texto="en camino" valor={cuenta((c) => etapa(c) === 'EN_CAMINO')} />
        <Kpi texto="SINPE por verificar" valor={porVerificar} alerta={porVerificar > 0} />
        <label className="flex h-10 w-48 items-center gap-2 rounded-[10px] bg-app px-3">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="sr-only">Buscar pedido</span>
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="#, nombre o teléfono"
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Segmentado
          etiqueta="Tipo de pedido"
          valor={canal}
          onCambio={setCanal}
          opciones={[
            {
              id: 'TODOS',
              texto: 'Todos',
              cantidad: todas.filter((c) => !['ENTREGADO', 'RECHAZADO'].includes(etapa(c))).length,
            },
            {
              id: 'RECOGER',
              texto: 'Recoger',
              cantidad: todas.filter(
                (c) => c.tipo === 'RECOGER' && !['ENTREGADO', 'RECHAZADO'].includes(etapa(c)),
              ).length,
            },
            {
              id: 'DOMICILIO',
              texto: 'Domicilio',
              cantidad: todas.filter(
                (c) => c.tipo === 'DOMICILIO' && !['ENTREGADO', 'RECHAZADO'].includes(etapa(c)),
              ).length,
            },
          ]}
        />
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>
      {error && (
        <p role="alert" className="mx-3 mt-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {menu && !menu.restaurante.enLinea.activo && (
        <p className="mx-3 mt-3 rounded-md bg-amber-soft p-3 text-sm text-amber">
          Los pedidos en línea están desactivados. El dueño los activa en Panel → Ajustes.
        </p>
      )}
      {!cuentas ? (
        <div className="m-3 esqueleto h-60 rounded-xl" aria-busy="true" />
      ) : (
        <main className="flex flex-1 flex-wrap gap-3 p-3 lg:min-h-0 lg:flex-nowrap">
          <ColumnaTablero
            titulo="Nuevos"
            punto="bg-info"
            cantidad={nuevos.length}
            pista="Acepte o rechace"
            className="w-full lg:w-auto lg:flex-[1_1_0]"
          >
            {nuevos.length === 0 ? (
              vacio('Sin pedidos nuevos')
            ) : (
              <div className={grid}>{nuevos.map(tarjeta)}</div>
            )}
          </ColumnaTablero>
          <ColumnaTablero
            titulo="En cocina"
            punto="bg-amber"
            cantidad={enCocina.length}
            pista="Esperando SINPE arriba"
            className="w-full lg:w-auto lg:flex-[1.6_1_0]"
          >
            {enCocina.length === 0 ? (
              vacio('Nada en cocina')
            ) : (
              <div className={grid}>{enCocina.map(tarjeta)}</div>
            )}
          </ColumnaTablero>
          <ColumnaTablero
            titulo="Listos y en camino"
            punto="bg-ok"
            cantidad={salida.length}
            pista="Entregar y cobrar"
            className="w-full lg:w-auto lg:flex-[1.2_1_0]"
          >
            {salida.length === 0 ? (
              vacio('Nada listo todavía')
            ) : (
              <div className={grid}>{salida.map(tarjeta)}</div>
            )}
          </ColumnaTablero>
          <ColumnaTablero
            titulo="Terminados"
            punto="bg-muted"
            cantidad={terminados.length}
            pista="Últimas 12 h"
            className="w-full lg:w-[280px] lg:flex-none"
          >
            {terminados.length === 0 ? (
              vacio('Todavía nada')
            ) : (
              <ul className="flex flex-col gap-2">
                {terminados.map((c) => (
                  <Terminado key={c.id} c={c} precio={precio} />
                ))}
              </ul>
            )}
          </ColumnaTablero>
        </main>
      )}
    </div>
  );
}
