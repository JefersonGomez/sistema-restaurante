import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleOff, QrCode, Store } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { incluyeMesas, type MesaOperacion, type Moneda, type ReporteHoy } from '@menu-qr/shared';
import { formatoPrecio, Modal } from '@menu-qr/ui';
import { api } from '../api';
import { useAuth } from '../auth';
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
type Restaurante = {
  id: string;
  nombre: string;
  moneda: Moneda;
  cerradoManual: boolean;
  enLineaActivo: boolean;
};

const claseLink =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-surface px-4 text-sm font-semibold hover:bg-surface-2';

// Asistente de inicio (Fase 20.7): menú → mesas (o pedidos en línea) → personal → listo.
function PrimerosPasos({ restaurante, conMesas }: { restaurante: Restaurante; conMesas: boolean }) {
  const clave = `kitchago:primeros-pasos:${restaurante.id}`;
  const [oculto, setOculto] = useState(() => {
    try {
      return localStorage.getItem(clave) === 'oculto';
    } catch {
      return false;
    }
  });
  const platos = useQuery({ queryKey: ['platos'], queryFn: () => api<Plato[]>('/platos') });
  const mesas = useQuery({
    queryKey: ['mesas'],
    queryFn: () => api<{ activa: boolean }[]>('/mesas'),
    enabled: conMesas,
  });
  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<{ rol: string; activo: boolean }[]>('/usuarios'),
  });
  if (oculto || !platos.data || !usuarios.data || (conMesas && !mesas.data)) return null;

  const pasos = [
    {
      titulo: 'Cargue su menú',
      detalle: 'Categorías y platos con precio. La foto es opcional.',
      hecho: platos.data.some((p) => p.activo),
      a: '/panel/menu',
      boton: 'Ir al menú',
    },
    conMesas
      ? {
          titulo: 'Cree sus mesas e imprima los QR',
          detalle: 'Cada mesa lleva su QR para que el cliente pida desde el celular.',
          hecho: !!mesas.data?.some((m) => m.activa),
          a: '/panel/mesas',
          boton: 'Ir a mesas',
        }
      : {
          titulo: 'Active los pedidos en línea',
          detalle: 'Recoger en el local, domicilio y SINPE.',
          hecho: restaurante.enLineaActivo,
          a: '/panel/ajustes?seccion=en-linea',
          boton: 'Ir a pedidos en línea',
        },
    {
      titulo: 'Agregue a su personal',
      detalle: 'Cocina, caja y meseros entran con su propio usuario o PIN.',
      hecho: usuarios.data.some((u) => u.rol !== 'DUENO' && u.activo),
      a: '/panel/personal',
      boton: 'Ir a personal',
    },
  ];
  const listos = pasos.filter((p) => p.hecho).length;
  const siguiente = pasos.find((p) => !p.hecho);
  const ocultar = () => {
    try {
      localStorage.setItem(clave, 'oculto');
    } catch {
      // Sin almacenamiento: se oculta solo esta vez.
    }
    setOculto(true);
  };

  return (
    <Tarjeta className="mt-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">
            {siguiente ? 'Primeros pasos' : '¡Listo para recibir pedidos!'}
          </h2>
          <p className="text-sm text-muted">
            {siguiente
              ? `${listos} de ${pasos.length} hechos. Lo demás (factura electrónica, Wi-Fi, colores) es opcional.`
              : 'Ya tiene todo lo necesario. Lo opcional está en Ajustes y Personalizar.'}
          </p>
        </div>
        <button
          type="button"
          onClick={ocultar}
          className="min-h-11 shrink-0 rounded-md px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-fg"
        >
          Ocultar
        </button>
      </div>
      <ol className="space-y-2">
        {pasos.map((p, i) => (
          <li
            key={p.titulo}
            className={`flex flex-wrap items-center gap-3 rounded-md p-2 ${p === siguiente ? 'bg-purple-soft' : ''}`}
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${p.hecho ? 'bg-ok text-on-accent' : 'bg-surface text-muted'}`}
            >
              {p.hecho ? <Check className="size-4" aria-label="Hecho" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${p.hecho ? 'text-muted line-through' : ''}`}>
                {p.titulo}
              </p>
              {!p.hecho && <p className="text-sm text-muted">{p.detalle}</p>}
            </div>
            {!p.hecho && (
              <Link to={p.a} className={claseLink}>
                {p.boton}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}

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
  const conMesas = incluyeMesas(usuario?.restaurante?.plan ?? 'COMPLETO');
  const reporte = useQuery({
    queryKey: ['reporte-hoy'],
    queryFn: () => api<ReporteHoy>('/reportes/hoy'),
  });
  const mesas = useQuery({
    queryKey: ['mesas-operacion'],
    queryFn: () => api<MesaOperacion[]>('/operacion/mesas'),
    enabled: conMesas,
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

      {restaurante.data && <PrimerosPasos restaurante={restaurante.data} conMesas={conMesas} />}

      {/* Lo esencial del día; el ticket promedio y lo demás está en Reportes. */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Indicador
          titulo="Ventas de hoy"
          valor={reporte.data && precio(reporte.data.totalVendido)}
        />
        {conMesas && <Indicador titulo="Cuentas abiertas" valor={abiertas} />}
        {!!pendientes && (
          <Indicador titulo="Pedidos por confirmar" valor={pendientes} tono="amber" />
        )}
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
        {conMesas && (
          <Tarjeta className="flex flex-col gap-3">
            <QrCode className="size-6 text-purple" aria-hidden />
            <div>
              <p className="font-semibold">Imprimir QR</p>
              <p className="text-sm text-muted">Tarjetas recortables con el QR de cada mesa.</p>
            </div>
            <Link to="/panel/mesas" className={claseLink}>
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
