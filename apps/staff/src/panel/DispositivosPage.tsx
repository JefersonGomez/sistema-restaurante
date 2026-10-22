import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tablet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { codigoDispositivoSchema } from '@menu-qr/shared';
import { api, type ErrorApi } from '../api';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  EstadoVacio,
  Etiqueta,
  Tarjeta,
  TituloPagina,
} from './comunes';

type Dispositivo = {
  id: string;
  nombre: string;
  estacion: { id: string; nombre: string };
  codigo: string | null;
  codigoExpira: string | null;
  vinculadoEn: string | null;
  ultimoUso: string | null;
};

const fecha = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-CR', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Nunca';

// Minutos:segundos que le quedan al código; se actualiza cada segundo.
function Cuenta({ hasta }: { hasta: string }) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((new Date(hasta).getTime() - ahora) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

function NuevoCodigo({ onListo }: { onListo: () => void }) {
  const qc = useQueryClient();
  const estaciones = useQuery({
    queryKey: ['estaciones'],
    queryFn: () => api<{ id: string; nombre: string }[]>('/estaciones'),
  });
  const [nombre, setNombre] = useState('');
  const [estacionId, setEstacionId] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const crear = useMutation({
    mutationFn: (body: object) => api('/dispositivos/codigo', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispositivos'] });
      onListo();
    },
    onError: (e: ErrorApi) => setErrores({ general: e.message }),
  });
  const enviar = () => {
    const r = codigoDispositivoSchema.safeParse({
      nombre,
      estacionId: estacionId || estaciones.data?.[0]?.id,
    });
    if (!r.success) return setErrores(erroresDe(r.error));
    crear.mutate(r.data);
  };
  return (
    <Tarjeta className="mb-4 space-y-3 border border-purple">
      <p className="font-semibold">Vincular una tablet</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre de la tablet"
          placeholder="Tablet de la cocina"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          error={errores.nombre}
        />
        <label className="block text-sm">
          <span className="font-medium">Estación</span>
          <select
            value={estacionId}
            onChange={(e) => setEstacionId(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg"
          >
            {estaciones.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      {errores.general && <p className="text-sm text-danger">{errores.general}</p>}
      <div className="flex gap-2">
        <Boton onClick={enviar} disabled={crear.isPending || !estaciones.data}>
          Generar código
        </Boton>
        <Boton variante="suave" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </Tarjeta>
  );
}

export function DispositivosPage() {
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(false);
  const [revocando, setRevocando] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ['dispositivos'],
    queryFn: () => api<Dispositivo[]>('/dispositivos'),
    // Mientras hay un código esperando, se revisa seguido para ver cuándo se vincula.
    refetchInterval: (q) => (q.state.data?.some((d) => !d.vinculadoEn) ? 3000 : false),
  });
  const revocar = useMutation({
    mutationFn: (id: string) => api(`/dispositivos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setRevocando(null);
      qc.invalidateQueries({ queryKey: ['dispositivos'] });
    },
  });

  if (lista.isError)
    return (
      <ErrorCarga
        mensaje="No se pudieron cargar los dispositivos"
        onReintentar={() => lista.refetch()}
      />
    );

  return (
    <>
      <TituloPagina
        titulo="Dispositivos"
        detalle="Tablets de cocina y bar. Una vez vinculada, el personal entra en ella con su PIN, sin correo."
        acciones={
          <Boton onClick={() => setNuevo(true)}>
            <Plus className="size-4" aria-hidden /> Vincular tablet
          </Boton>
        }
      />
      {nuevo && <NuevoCodigo onListo={() => setNuevo(false)} />}

      {lista.isLoading ? (
        <Esqueleto className="h-40" />
      ) : !lista.data?.length ? (
        <EstadoVacio
          titulo="No hay tablets vinculadas"
          detalle="Pulse «Vincular tablet», abra en la tablet la dirección /tablet de este sistema y escriba el código."
        />
      ) : (
        <ul className="space-y-2">
          {lista.data.map((d) => (
            <li key={d.id}>
              <Tarjeta className="flex flex-wrap items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-purple-soft text-purple">
                  <Tablet className="size-5" aria-hidden />
                </span>
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold">{d.nombre}</p>
                  <p className="text-sm text-muted">
                    {d.vinculadoEn
                      ? `Vinculada el ${fecha(d.vinculadoEn)} · Último uso: ${fecha(d.ultimoUso)}`
                      : 'Esperando que la tablet escriba el código'}
                  </p>
                </div>
                <Etiqueta tono="neutro">{d.estacion.nombre}</Etiqueta>
                {d.codigo && d.codigoExpira ? (
                  <div className="rounded-md bg-amber-soft px-4 py-2 text-center text-amber-ink">
                    <p className="text-2xl font-bold tracking-[0.3em] tabular-nums">{d.codigo}</p>
                    <p className="text-xs">
                      Vence en <Cuenta hasta={d.codigoExpira} />
                    </p>
                  </div>
                ) : revocando === d.id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-danger">Se cerrará la sesión de la tablet.</span>
                    <Boton
                      variante="peligro"
                      onClick={() => revocar.mutate(d.id)}
                      disabled={revocar.isPending}
                    >
                      Desvincular
                    </Boton>
                    <Boton variante="suave" onClick={() => setRevocando(null)}>
                      Cancelar
                    </Boton>
                  </span>
                ) : (
                  <Boton variante="suave" onClick={() => setRevocando(d.id)}>
                    Desvincular
                  </Boton>
                )}
                {d.codigo && (
                  <Boton variante="suave" onClick={() => revocar.mutate(d.id)}>
                    Anular código
                  </Boton>
                )}
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
