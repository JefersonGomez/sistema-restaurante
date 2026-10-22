import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { EstadoMesa, MesaOperacion } from '@menu-qr/shared';
import { api, descargar, type ErrorApi } from '../api';
import {
  Boton,
  Campo,
  ErrorCarga,
  Esqueleto,
  EstadoVacio,
  Etiqueta,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from './comunes';

type Mesa = { id: string; numero: number; nombre: string | null; activa: boolean; tokenQr: string };

const ESTADO: Record<
  EstadoMesa,
  { texto: string; tono: 'neutro' | 'purple' | 'amber' | 'danger' }
> = {
  LIBRE: { texto: 'Libre', tono: 'neutro' },
  OCUPADA: { texto: 'Ocupada', tono: 'purple' },
  PEDIDO_PENDIENTE: { texto: 'Pedido por confirmar', tono: 'amber' },
  PIDIO_CUENTA: { texto: 'Pidió la cuenta', tono: 'amber' },
  LLAMADA: { texto: 'Llamando', tono: 'amber' },
};

export function MesasPage() {
  const qc = useQueryClient();
  const [desde, setDesde] = useState('1');
  const [hasta, setHasta] = useState('12');
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [regenerando, setRegenerando] = useState<string | null>(null);
  const [reimprimir, setReimprimir] = useState<Mesa[]>([]);
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);

  const mesas = useQuery({ queryKey: ['mesas'], queryFn: () => api<Mesa[]>('/mesas') });
  const estados = useQuery({
    queryKey: ['mesas-operacion'],
    queryFn: () => api<MesaOperacion[]>('/operacion/mesas'),
  });
  const estadoDe = new Map(estados.data?.map((m) => [m.id, m.estado]));

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['mesas'] });
    qc.invalidateQueries({ queryKey: ['mesas-operacion'] });
  };
  const lote = useMutation({
    mutationFn: () =>
      api<{ creadas: number; yaExistian: number }>('/mesas/lote', {
        method: 'POST',
        body: { desde: Number(desde), hasta: Number(hasta) },
      }),
    onSuccess: (r) => {
      invalidar();
      setMensaje({
        tono: 'ok',
        texto: `Se crearon ${r.creadas} mesas${r.yaExistian ? ` (${r.yaExistian} ya existían)` : ''}.`,
      });
    },
    onError: (e: ErrorApi) => setMensaje({ tono: 'error', texto: e.message }),
  });
  const activar = useMutation({
    mutationFn: (m: { id: string; activa: boolean }) =>
      api(`/mesas/${m.id}`, { method: 'PATCH', body: { activa: m.activa } }),
    onSuccess: invalidar,
  });
  const regenerar = useMutation({
    mutationFn: (m: Mesa) => api<Mesa>(`/mesas/${m.id}/regenerar-token`, { method: 'POST' }),
    onSuccess: (m) => {
      invalidar();
      setRegenerando(null);
      // El QR viejo deja de funcionar: hay que reimprimir el de esta mesa.
      setReimprimir((r) => [...r.filter((x) => x.id !== m.id), m]);
    },
  });

  const pdf = async (formato: 'tarjetas' | 'acrilico', ids?: string[]) => {
    setMensaje(null);
    try {
      await descargar(
        `/mesas/qr.pdf?formato=${formato}${ids?.length ? `&ids=${ids.join(',')}` : ''}`,
        `qr-mesas-${formato}.pdf`,
      );
    } catch (e) {
      setMensaje({ tono: 'error', texto: (e as Error).message });
    }
  };

  if (mesas.isError)
    return (
      <ErrorCarga mensaje="No se pudieron cargar las mesas" onReintentar={() => mesas.refetch()} />
    );
  const lista = mesas.data ?? [];
  const todas = lista.length > 0 && seleccion.length === lista.length;

  return (
    <>
      <TituloPagina
        titulo="Mesas y QR"
        detalle="Imprima las tarjetas con el QR de cada mesa. Al escanearlo, el cliente abre el menú de esa mesa."
        acciones={
          <>
            <Boton onClick={() => pdf('tarjetas', seleccion)} disabled={!lista.length}>
              <Printer className="size-4" aria-hidden />{' '}
              {seleccion.length ? `PDF de ${seleccion.length}` : 'PDF de todas'} (6 por hoja)
            </Boton>
            <Boton
              variante="suave"
              onClick={() => pdf('acrilico', seleccion)}
              disabled={!lista.length}
            >
              <Download className="size-4" aria-hidden /> Una por hoja (acrílico)
            </Boton>
          </>
        }
      />

      {reimprimir.length > 0 && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-amber-soft p-3 text-sm text-amber-ink"
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">
            Se cambió el QR de {reimprimir.map((m) => `la mesa ${m.numero}`).join(', ')}. El QR
            impreso anterior ya no funciona: reimprímalo.
          </span>
          <Boton
            variante="amber"
            onClick={() =>
              pdf(
                'tarjetas',
                reimprimir.map((m) => m.id),
              ).then(() => setReimprimir([]))
            }
          >
            Descargar QR nuevo
          </Boton>
        </div>
      )}
      {mensaje && (
        <p
          role="status"
          className={`mb-4 rounded-md p-3 text-sm ${mensaje.tono === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
        >
          {mensaje.texto}
        </p>
      )}

      <Tarjeta className="mb-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            lote.mutate();
          }}
        >
          <p className="w-full font-semibold">Crear varias mesas</p>
          <Campo
            etiqueta="De la mesa"
            type="number"
            min={1}
            max={9999}
            className="w-32"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <Campo
            etiqueta="A la mesa"
            type="number"
            min={1}
            max={9999}
            className="w-32"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
          <Boton type="submit" disabled={lote.isPending}>
            Crear mesas
          </Boton>
        </form>
      </Tarjeta>

      {mesas.isLoading ? (
        <Esqueleto className="h-64" />
      ) : lista.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay mesas"
          detalle="Cree sus mesas arriba (por ejemplo de la 1 a la 12) y luego imprima los QR."
        />
      ) : (
        <Tarjeta className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted uppercase">
              <tr className="border-b border-line">
                <th className="w-12 p-3">
                  <input
                    type="checkbox"
                    aria-label="Elegir todas"
                    checked={todas}
                    onChange={() => setSeleccion(todas ? [] : lista.map((m) => m.id))}
                    className="size-5 accent-purple"
                  />
                </th>
                <th className="p-3">Mesa</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Activa</th>
                <th className="p-3 text-right">QR</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const estado = ESTADO[estadoDe.get(m.id) ?? 'LIBRE'];
                return (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Elegir mesa ${m.numero}`}
                        checked={seleccion.includes(m.id)}
                        onChange={() =>
                          setSeleccion((s) =>
                            s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id],
                          )
                        }
                        className="size-5 accent-purple"
                      />
                    </td>
                    <td className="p-3 font-semibold">
                      Mesa {m.numero}
                      {m.nombre && <span className="ml-2 font-normal text-muted">{m.nombre}</span>}
                    </td>
                    <td className="p-3">
                      {m.activa ? (
                        <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
                      ) : (
                        <Etiqueta tono="neutro">Desactivada</Etiqueta>
                      )}
                    </td>
                    <td className="p-1">
                      <Interruptor
                        activo={m.activa}
                        etiqueta={`Mesa ${m.numero} activa`}
                        onCambio={(activa) => activar.mutate({ id: m.id, activa })}
                      />
                    </td>
                    <td className="p-2 text-right">
                      {regenerando === m.id ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                          <span className="text-xs text-danger">
                            El QR impreso dejará de servir.
                          </span>
                          <Boton
                            variante="peligro"
                            onClick={() => regenerar.mutate(m)}
                            disabled={regenerar.isPending}
                          >
                            Cambiar QR
                          </Boton>
                          <Boton variante="suave" onClick={() => setRegenerando(null)}>
                            Cancelar
                          </Boton>
                        </span>
                      ) : (
                        <span className="inline-flex">
                          <button
                            type="button"
                            aria-label={`Descargar QR de la mesa ${m.numero}`}
                            onClick={() => pdf('tarjetas', [m.id])}
                            className="grid size-11 place-items-center rounded-md hover:bg-surface"
                          >
                            <Download className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label={`Cambiar el QR de la mesa ${m.numero}`}
                            onClick={() => setRegenerando(m.id)}
                            className="grid size-11 place-items-center rounded-md hover:bg-surface"
                          >
                            <RefreshCw className="size-4" aria-hidden />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Tarjeta>
      )}
    </>
  );
}
