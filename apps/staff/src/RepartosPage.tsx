import { Bike, Check, MapPin, Navigation, Phone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CuentaDetalle, MenuPublico } from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { METODOS } from './EnLineaPage';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import {
  BotonSonido,
  Conexion,
  Encabezado,
  enlacesMapa,
  formatoPrecio,
  hora,
  TituloColumna,
} from './ui';

const boton =
  'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md px-4 text-[15px] font-semibold disabled:opacity-50';

// Una entrega en el celular del repartidor: llamar, abrir la ruta, salir y entregar.
function Entrega({
  c,
  precio,
  ocupado,
  onAccion,
}: {
  c: CuentaDetalle;
  precio: (n: number) => string;
  ocupado: boolean;
  onAccion: (ruta: string, body?: object) => void;
}) {
  const d = c.enLinea!;
  const [metodo, setMetodo] = useState<string>(d.pagoElegido ?? 'EFECTIVO');
  const mapa = enlacesMapa(d);
  const items = c.pedidos.flatMap((p) => p.items).filter((i) => !i.cancelado);
  const listos = items.filter((i) => i.estado === 'LISTO' || i.estado === 'ENTREGADO').length;
  const nota = c.pedidos.find((p) => p.nota)?.nota;
  const terminado = d.etapa === 'ENTREGADO';
  const yaPagado = d.pagoElegido === 'SINPE' && d.pagoVerificado;
  const estado = {
    ACEPTADO: ['bg-amber-soft text-amber-ink', `En cocina · ${listos}/${items.length} listos`],
    LISTO: ['bg-ok-soft text-ok', 'Listo para salir'],
    EN_CAMINO: ['bg-info-soft text-info', 'En camino'],
    ENTREGADO: ['bg-surface-2 text-muted', `Entregado · ${c.metodoPago?.toLowerCase() ?? ''}`],
  }[d.etapa as string] ?? ['bg-surface-2 text-muted', d.etapa];

  return (
    <article
      className={`anim-entrar flex flex-col gap-3 rounded-lg bg-app p-4 shadow-tarjeta ${terminado ? 'opacity-70' : ''}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-extrabold">
            #{d.numero} · {d.clienteNombre}
          </p>
          <p className="text-xs text-muted">Pedido a las {hora(c.abiertaEn)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${estado[0]}`}>
          {estado[1]}
        </span>
      </header>

      <div className="flex flex-col gap-1 text-sm">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            {d.direccion}
            {d.referencia && <span className="text-muted"> · {d.referencia}</span>}
          </span>
        </p>
        {d.ubicacion && (
          <p className="flex items-center gap-1.5 text-xs text-info">
            <Navigation className="size-3.5" aria-hidden /> El cliente marcó el punto exacto
          </p>
        )}
      </div>

      {!terminado && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${d.clienteTelefono.replace(/[^0-9+]/g, '')}`}
            className={`${boton} bg-surface text-fg`}
          >
            <Phone className="size-4" aria-hidden /> Llamar
          </a>
          <a href={mapa.google} target="_blank" rel="noreferrer" className={`${boton} bg-surface`}>
            Google Maps
          </a>
          <a href={mapa.waze} target="_blank" rel="noreferrer" className={`${boton} bg-surface`}>
            Waze
          </a>
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">
          {items.reduce((n, i) => n + i.cantidad, 0)} productos
        </summary>
        <ul className="mt-1 space-y-0.5">
          {items.map((i) => (
            <li key={i.id}>
              <span className="font-medium">{i.cantidad}×</span> {i.nombreEs}
            </li>
          ))}
        </ul>
      </details>
      {nota && (
        <p className="rounded-md bg-amber-soft px-3 py-2 text-sm text-amber-ink">Nota: {nota}</p>
      )}

      <p
        className={`rounded-md px-3 py-2 text-[15px] font-semibold ${yaPagado || terminado ? 'bg-ok-soft text-ok' : 'bg-amber-soft text-amber-ink'}`}
      >
        {terminado
          ? `Cobrado ${precio(c.total)} (${METODOS.find((m) => m.id === c.metodoPago)?.texto.toLowerCase() ?? ''})`
          : yaPagado
            ? `Ya pagado por SINPE (${precio(c.total)})`
            : `Cobrar ${precio(c.total)} en ${d.pagoElegido === 'SINPE' ? 'SINPE' : 'efectivo'}`}
      </p>

      {d.etapa === 'LISTO' && (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onAccion(`/repartos/${c.id}/salir`)}
          className={`${boton} bg-purple text-on-accent`}
        >
          <Bike className="size-5" aria-hidden /> Salí a entregar
        </button>
      )}
      {d.etapa === 'EN_CAMINO' && (
        <div className="flex gap-2">
          {!yaPagado && (
            <select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value)}
              aria-label="Cómo pagó"
              className="min-h-12 rounded-md border border-line bg-surface px-2"
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
            onClick={() =>
              confirm(
                yaPagado
                  ? '¿Entregado al cliente?'
                  : `¿Entregado y cobrado ${precio(c.total)} (${metodo.toLowerCase()})?`,
              ) &&
              onAccion(`/repartos/${c.id}/entregar`, { metodoPago: yaPagado ? 'SINPE' : metodo })
            }
            className={`${boton} bg-ok text-on-accent`}
          >
            <Check className="size-5" aria-hidden /> Entregué
          </button>
        </div>
      )}
    </article>
  );
}

export function RepartosPage() {
  const { usuario } = useAuth();
  const [entregas, setEntregas] = useState<CuentaDetalle[] | null>(null);
  const [menu, setMenu] = useState<MenuPublico>();
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const slug = usuario?.restaurante?.slug ?? '';

  useEffect(() => {
    if (slug) obtenerMenu(slug).then(setMenu, () => {});
  }, [slug]);
  const precio = formatoPrecio(menu?.restaurante.moneda ?? 'CRC');

  const cargar = useCallback(async () => {
    try {
      setEntregas(await api<CuentaDetalle[]>('/repartos'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const refrescar = useRefrescoAgrupado(cargar);
  // El sonido de "le asignaron una entrega" lo da AvisosGlobales; aquí solo se refresca.
  const conectado = useTiempoReal(
    { 'reparto:asignado': refrescar, 'enlinea:actualizado': refrescar },
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

  const lista = entregas ?? [];
  const pendientes = lista.filter((c) => c.enLinea?.etapa !== 'ENTREGADO');
  const hechas = lista.filter((c) => c.enLinea?.etapa === 'ENTREGADO');
  const efectivo = hechas
    .filter((c) => c.metodoPago === 'EFECTIVO' && !c.enLinea?.efectivoCuadrado)
    .reduce((n, c) => n + c.total, 0);

  return (
    <div className="tema-operacion min-h-dvh">
      <Encabezado titulo="Mis entregas">
        <BotonSonido />
        <Conexion conectado={conectado} />
      </Encabezado>
      {error && (
        <p role="alert" className="m-3 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!entregas ? (
        <div className="m-3 esqueleto h-60 rounded-lg" aria-busy="true" />
      ) : (
        <main className="mx-auto flex max-w-xl flex-col gap-3 p-3">
          {efectivo > 0 && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm">
              Efectivo por entregar en caja: <strong>{precio(efectivo)}</strong>
            </p>
          )}
          {pendientes.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
              No tiene entregas asignadas. Le avisaremos con un sonido cuando le asignen una.
            </p>
          )}
          {pendientes.map((c) => (
            <Entrega key={c.id} c={c} precio={precio} ocupado={ocupado} onAccion={accion} />
          ))}
          {hechas.length > 0 && (
            <div className="mt-4">
              <TituloColumna titulo="Entregadas hoy" punto="bg-ok" cantidad={hechas.length} />
            </div>
          )}
          {hechas.map((c) => (
            <Entrega key={c.id} c={c} precio={precio} ocupado={ocupado} onAccion={accion} />
          ))}
        </main>
      )}
    </div>
  );
}
