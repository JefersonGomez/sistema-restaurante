import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleOff, QrCode, Store } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MesaOperacion, Moneda, ReporteHoy } from '@menu-qr/shared';
import { formatoPrecio, Modal } from '@menu-qr/ui';
import { api } from '../api';
import { useAuth } from '../auth';
import { verSeccion } from '../ui';
import { useTiempoReal } from '../tiempoReal';
import {
  Boton,
  ErrorCarga,
  Esqueleto,
  Etiqueta,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from './comunes';

type Plato = { id: string; nombreEs: string; agotado: boolean; activo: boolean };
type Restaurante = { nombre: string; moneda: Moneda; cerradoManual: boolean };

function Indicador({
  titulo,
  valor,
  tono,
}: {
  titulo: string;
  valor: string | number | undefined;
  tono?: 'amber' | 'danger';
}) {
  return (
    <Tarjeta>
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{titulo}</p>
      {valor === undefined ? (
        <Esqueleto className="mt-2 h-8 w-24" />
      ) : (
        <p
          className={`mt-1 text-[26px] font-semibold tabular-nums ${tono === 'amber' ? 'text-amber-ink' : tono === 'danger' ? 'text-danger' : ''}`}
        >
          {valor}
        </p>
      )}
    </Tarjeta>
  );
}

export function InicioPage() {
  const { usuario } = useAuth();
  const qc = useQueryClient();
  const [agotadosAbierto, setAgotadosAbierto] = useState(false);
  const reporte = useQuery({
    queryKey: ['reporte-hoy'],
    queryFn: () => api<ReporteHoy>('/reportes/hoy'),
  });
  const mesas = useQuery({
    queryKey: ['mesas-operacion'],
    queryFn: () => api<MesaOperacion[]>('/operacion/mesas'),
  });
  const platos = useQuery({ queryKey: ['platos'], queryFn: () => api<Plato[]>('/platos') });
  const restaurante = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<Restaurante>('/restaurante'),
  });

  // Se actualiza solo cuando pasa algo en el restaurante.
  const refrescar = () =>
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'restaurante' });
  useTiempoReal(
    {
      'pedido:nuevo': refrescar,
      'pedido:confirmado': refrescar,
      'cuenta:cerrada': refrescar,
      'cuenta:actualizada': refrescar,
      'menu:actualizado': refrescar,
    },
    refrescar,
  );

  const cerrarTemporal = useMutation({
    mutationFn: (cerradoManual: boolean) =>
      api<Restaurante>('/restaurante', { method: 'PATCH', body: { cerradoManual } }),
    onSuccess: (r) => qc.setQueryData(['restaurante'], r),
  });
  const agotar = useMutation({
    mutationFn: (p: { id: string; agotado: boolean }) =>
      api(`/platos/${p.id}/agotado`, { method: 'PATCH', body: { agotado: p.agotado } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platos'] }),
  });

  const precio = formatoPrecio(restaurante.data?.moneda ?? 'CRC');
  const abiertas = mesas.data?.filter((m) => m.cuenta).length;
  const pendientes = mesas.data?.reduce((s, m) => s + (m.cuenta?.pedidosPendientes ?? 0), 0);
  const agotados = platos.data?.filter((p) => p.activo && p.agotado);
  const cerrado = restaurante.data?.cerradoManual;
  const error = [reporte, mesas, platos, restaurante].find((q) => q.isError);

  return (
    <>
      <TituloPagina
        titulo="Inicio"
        detalle={
          cerrado
            ? 'Cerrado temporalmente: los comensales no pueden pedir.'
            : 'Así va el día de hoy.'
        }
        acciones={
          cerrado !== undefined && (
            <Etiqueta tono={cerrado ? 'danger' : 'ok'}>{cerrado ? 'Cerrado' : 'Abierto'}</Etiqueta>
          )
        }
      />
      {error && (
        <ErrorCarga
          mensaje="No se pudieron cargar los datos de hoy"
          onReintentar={() => qc.invalidateQueries()}
        />
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador
          titulo="Ventas de hoy"
          valor={reporte.data && precio(reporte.data.totalVendido)}
        />
        <Indicador titulo="Cuentas abiertas" valor={abiertas} />
        <Indicador
          titulo="Ticket promedio"
          valor={reporte.data && precio(reporte.data.ticketPromedio)}
        />
        <Indicador
          titulo="Pedidos por confirmar"
          valor={pendientes}
          tono={pendientes ? 'amber' : undefined}
        />
        <Indicador
          titulo="Platos agotados"
          valor={agotados?.length}
          tono={agotados?.length ? 'danger' : undefined}
        />
      </div>

      <h2 className="mt-8 mb-3 text-[17px] font-semibold">Accesos rápidos</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tarjeta className="flex flex-col gap-3">
          <CircleOff className="size-6 text-danger" aria-hidden />
          <div>
            <p className="font-semibold">Marcar agotado</p>
            <p className="text-sm text-muted">El menú del comensal se actualiza al instante.</p>
          </div>
          <Boton variante="suave" onClick={() => setAgotadosAbierto(true)}>
            Elegir platos
          </Boton>
        </Tarjeta>
        <Tarjeta className="flex flex-col gap-3">
          <Store className="size-6 text-amber-ink" aria-hidden />
          <div>
            <p className="font-semibold">{cerrado ? 'Volver a abrir' : 'Cerrar temporalmente'}</p>
            <p className="text-sm text-muted">
              {cerrado
                ? 'Los comensales podrán pedir otra vez según el horario.'
                : 'Los comensales ven el menú pero no pueden pedir.'}
            </p>
          </div>
          <Boton
            variante={cerrado ? 'principal' : 'amber'}
            disabled={cerrado === undefined || cerrarTemporal.isPending}
            onClick={() => cerrarTemporal.mutate(!cerrado)}
          >
            {cerrado ? 'Abrir' : 'Cerrar ahora'}
          </Boton>
        </Tarjeta>
        {verSeccion(usuario?.restaurante?.plan, '/panel/mesas') && (
          <Tarjeta className="flex flex-col gap-3">
            <QrCode className="size-6 text-purple" aria-hidden />
            <div>
              <p className="font-semibold">Imprimir QR</p>
              <p className="text-sm text-muted">Tarjetas recortables con el QR de cada mesa.</p>
            </div>
            <Link
              to="/panel/mesas"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-surface px-4 text-sm font-semibold hover:bg-surface-2"
            >
              Ir a mesas y QR
            </Link>
          </Tarjeta>
        )}
      </div>

      {agotadosAbierto && (
        <Modal etiqueta="Marcar platos agotados" onCerrar={() => setAgotadosAbierto(false)}>
          <div className="sticky top-0 -mx-5 flex items-center justify-between bg-app px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold">Marcar platos agotados</h2>
            <Boton variante="suave" onClick={() => setAgotadosAbierto(false)}>
              Listo
            </Boton>
          </div>
          <ul className="divide-y divide-line">
            {platos.data
              ?.filter((p) => p.activo)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-1">
                  <span className={p.agotado ? 'text-danger' : ''}>
                    {p.nombreEs}
                    {p.agotado && <span className="ml-2 text-xs font-semibold">Agotado</span>}
                  </span>
                  <Interruptor
                    activo={p.agotado}
                    etiqueta={`${p.nombreEs} agotado`}
                    disabled={agotar.isPending}
                    onCambio={(agotado) => agotar.mutate({ id: p.id, agotado })}
                  />
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </>
  );
}
