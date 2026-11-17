import { Bike } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AnularComprobanteInput, EfectivoRepartidor, Moneda } from '@menu-qr/shared';
import { api, obtenerMenu } from './api';
import { useAuth } from './auth';
import { ListaComprobantes, useComprobantes } from './FacturaCaja';
import { useRefrescoAgrupado, useTiempoReal } from './tiempoReal';
import { Conexion, Encabezado, formatoPrecio, VolverACaja } from './ui';

// Pantallas aparte de la caja (Fase 16): factura electrónica y efectivo de repartidores. Así la
// caja no se llena cuando hay muchos comprobantes o entregas.

function usePrecio() {
  const { usuario } = useAuth();
  const [moneda, setMoneda] = useState<Moneda>('CRC');
  useEffect(() => {
    if (usuario?.restaurante)
      obtenerMenu(usuario.restaurante.slug).then(
        (m) => setMoneda(m.restaurante.moneda),
        () => {},
      );
  }, [usuario]);
  return formatoPrecio(moneda);
}

function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accion = async (fn: () => Promise<unknown>) => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, error, accion };
}

type Filtro = 'todos' | 'problema' | 'hacienda' | 'aceptados';
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'problema', texto: 'Con problema' },
  { id: 'hacienda', texto: 'En Hacienda' },
  { id: 'aceptados', texto: 'Aceptados' },
];
const enFiltro = (f: Filtro, estado: string) =>
  f === 'todos' ||
  (f === 'problema' && (estado === 'ERROR' || estado === 'RECHAZADO')) ||
  (f === 'hacienda' && (estado === 'PENDIENTE' || estado === 'ENVIADO')) ||
  (f === 'aceptados' && estado === 'ACEPTADO');

export function ComprobantesCajaPage() {
  const precio = usePrecio();
  const fe = useComprobantes(0);
  const { ocupado, error, accion } = useAccion();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const lista = fe.datos?.comprobantes ?? [];

  const guardar = (ruta: string, body?: object) =>
    accion(async () => fe.setDatos(await api(ruta, { method: 'POST', body })));

  return (
    <div className="tema-operacion min-h-dvh">
      <Encabezado titulo="Factura electrónica">
        <VolverACaja />
      </Encabezado>
      <main className="space-y-4 p-4">
        {error && <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <p className="max-w-3xl text-sm text-muted">
          Cada cobro genera su tiquete o factura y se envía solo a Hacienda. Si el cliente dio su
          correo al cobrar, la copia le llega sola cuando Hacienda la acepta; «Enviar copia al
          cliente» es para reenviarla o mandarla a otro correo. Se muestran los últimos 30.
        </p>
        {fe.datos && !fe.datos.activa ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">
            La factura electrónica no está activa. El dueño la activa en Ajustes → Factura
            electrónica.
          </p>
        ) : (
          <>
            <div role="group" aria-label="Filtrar comprobantes" className="flex flex-wrap gap-1">
              {FILTROS.map((f) => {
                const n = lista.filter((c) => enFiltro(f.id, c.estado)).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                    className={`min-h-11 rounded-md px-4 text-sm font-medium ${filtro === f.id ? 'bg-purple text-on-accent' : 'bg-surface hover:bg-surface-2'}`}
                  >
                    {f.texto} ({n})
                  </button>
                );
              })}
            </div>
            {fe.datos && (
              <ListaComprobantes
                datos={{
                  ...fe.datos,
                  comprobantes: lista.filter((c) => enFiltro(filtro, c.estado)),
                }}
                precio={precio}
                ocupado={ocupado}
                onReintentar={(id) => guardar(`/comprobantes/${id}/reintentar`)}
                onAnular={(id, datos: AnularComprobanteInput) =>
                  guardar(`/comprobantes/${id}/anular`, datos)
                }
                onEnviarCorreo={(id, correo) => guardar(`/comprobantes/${id}/enviar`, { correo })}
                onNotaParcial={(id, datos) => guardar(`/comprobantes/${id}/nota-parcial`, datos)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export function RepartidoresCajaPage() {
  const precio = usePrecio();
  const { ocupado, error, accion } = useAccion();
  const [efectivo, setEfectivo] = useState<EfectivoRepartidor[] | null>(null);
  const cargar = useCallback(async () => {
    setEfectivo(await api<EfectivoRepartidor[]>('/enlinea/efectivo').catch(() => []));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const refrescar = useRefrescoAgrupado(cargar);
  const conectado = useTiempoReal({ 'enlinea:actualizado': refrescar }, refrescar);

  return (
    <div className="tema-operacion min-h-dvh">
      <Encabezado titulo="Efectivo de repartidores">
        <VolverACaja />
        <Conexion conectado={conectado} />
      </Encabezado>
      <main className="space-y-4 p-4">
        {error && <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <p className="max-w-3xl text-sm text-muted">
          Efectivo que traen los repartidores de los pedidos a domicilio. Al tocar «Recibido» entra
          al turno de caja.
        </p>
        {efectivo && !efectivo.length && (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">
            No hay efectivo pendiente de repartidores.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {efectivo?.map((e) => (
            <div
              key={e.repartidor.id}
              className="anim-entrar flex items-center gap-3 rounded-lg bg-app p-4 shadow-tarjeta"
            >
              <Bike className="size-8 shrink-0 text-info" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{e.repartidor.nombre}</span>
                <span className="block text-sm text-muted">
                  {e.pedidos === 1 ? '1 entrega' : `${e.pedidos} entregas`}
                </span>
                <span className="block font-display text-2xl font-extrabold tabular-nums">
                  {precio(e.total)}
                </span>
              </span>
              <button
                type="button"
                disabled={ocupado}
                onClick={() =>
                  confirm(`¿Recibió ${precio(e.total)} en efectivo de ${e.repartidor.nombre}?`) &&
                  accion(async () => {
                    await api('/enlinea/efectivo/recibir', {
                      method: 'POST',
                      body: { repartidorId: e.repartidor.id },
                    });
                    await cargar();
                  })
                }
                className="min-h-12 rounded-md bg-ok px-4 font-semibold text-on-accent disabled:opacity-50"
              >
                Recibido
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
