import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Phone, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import type { ClienteFila } from '@menu-qr/shared';
import { api, type ErrorApi } from '../api';
import { formatoPrecio } from '../ui';
import { Boton, ErrorCarga, Esqueleto, EstadoVacio, Etiqueta, TituloPagina } from './comunes';

type Config = {
  moneda: 'CRC' | 'USD';
  fidelidadActiva: boolean;
  sellosMeta: number;
  premioFidelidad: string | null;
};

// "8888 1234" para mostrar el teléfono normalizado.
const telefono = (t: string) => `${t.slice(0, 4)} ${t.slice(4)}`;

// Panel → Clientes: los de pedidos en línea, por teléfono (tengan cuenta o no).
export function ClientesPage() {
  const qc = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const termino = useDeferredValue(buscar.trim());
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const r = useQuery({ queryKey: ['restaurante'], queryFn: () => api<Config>('/restaurante') });
  const clientes = useQuery({
    queryKey: ['clientes', termino],
    queryFn: () =>
      api<ClienteFila[]>(`/clientes${termino ? `?buscar=${encodeURIComponent(termino)}` : ''}`),
    placeholderData: (previo) => previo,
  });
  const canjear = useMutation({
    mutationFn: (tel: string) =>
      api('/clientes/canjear', { method: 'POST', body: { telefono: tel } }),
    onSuccess: () => {
      setAviso({ ok: true, texto: 'Premio canjeado: entréguelo al cliente.' });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (e: ErrorApi) => setAviso({ ok: false, texto: e.message }),
  });
  const precio = formatoPrecio(r.data?.moneda ?? 'CRC');
  const meta = r.data?.fidelidadActiva ? r.data.sellosMeta : null;

  if (clientes.isError)
    return (
      <ErrorCarga
        mensaje="No se pudo cargar la lista de clientes"
        onReintentar={() => clientes.refetch()}
      />
    );

  return (
    <>
      <TituloPagina
        titulo="Clientes"
        detalle="Los clientes de sus pedidos en línea, reconocidos por su teléfono. Frecuente: 3 o más pedidos entregados en los últimos 30 días."
      />
      <label className="mb-4 flex min-h-11 items-center gap-2 rounded-md border border-line bg-app px-3">
        <Search className="size-4 text-muted" aria-hidden />
        <span className="sr-only">Buscar cliente</span>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          className="h-11 flex-1 bg-transparent outline-none"
        />
      </label>
      {meta === null && (
        <p className="mb-4 rounded-md bg-surface p-3 text-sm text-muted">
          La tarjeta de sellos está apagada. Se activa en Panel → Ajustes → Pedidos en línea.
        </p>
      )}
      {aviso && (
        <p
          role="status"
          className={`mb-4 rounded-md p-3 text-sm ${aviso.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
        >
          {aviso.texto}
        </p>
      )}

      {clientes.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Esqueleto key={i} className="h-16" />
          ))}
        </div>
      ) : !clientes.data?.length ? (
        <EstadoVacio
          titulo={termino ? 'Sin resultados' : 'Todavía no hay clientes'}
          detalle={
            termino
              ? 'Pruebe con otra parte del nombre o del teléfono.'
              : 'Aparecen aquí con su primer pedido en línea.'
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-app">
          {clientes.data.map((c) => {
            const completa = meta !== null && (c.sellos ?? 0) >= meta;
            return (
              <li key={c.telefono} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                <div className="min-w-48 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {c.nombre}
                    {c.frecuente && <Etiqueta tono="ok">Frecuente</Etiqueta>}
                    {c.registrado && <Etiqueta tono="purple">Con cuenta</Etiqueta>}
                  </p>
                  <a
                    href={`tel:${c.telefono}`}
                    className="inline-flex items-center gap-1 text-sm text-muted"
                  >
                    <Phone className="size-3.5" aria-hidden /> {telefono(c.telefono)}
                  </a>
                </div>
                <dl className="grid grid-cols-[4rem_6.5rem_6rem] gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Pedidos</dt>
                    <dd className="font-semibold">{c.pedidos}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Gastado</dt>
                    <dd className="font-semibold">{precio(c.gastado)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Último</dt>
                    <dd>{new Date(c.ultimoPedido).toLocaleDateString('es-CR')}</dd>
                  </div>
                </dl>
                {meta !== null && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${completa ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}
                    >
                      {Math.min(c.sellos ?? 0, meta)}/{meta} sellos
                    </span>
                    {completa && (
                      <Boton
                        variante="suave"
                        disabled={canjear.isPending}
                        onClick={() =>
                          confirm(
                            `¿Canjear «${r.data?.premioFidelidad ?? 'el premio'}» para ${c.nombre}?`,
                          ) && canjear.mutate(c.telefono)
                        }
                      >
                        <Gift className="size-4" aria-hidden /> Canjear
                      </Boton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
