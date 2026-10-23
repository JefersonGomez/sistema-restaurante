import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { categoriaSchema } from '@menu-qr/shared';
import { formatoPrecio, FotoPlato } from '@menu-qr/ui';
import { api, ErrorApi } from '../../api';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  EstadoVacio,
  Etiqueta,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from '../comunes';
import { ListaOrdenable } from './Ordenable';
import { PromocionDia } from './PromocionDia';

export type Categoria = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  icono: string | null;
  activa: boolean;
  orden: number;
};
export type PlatoFila = {
  id: string;
  categoriaId: string;
  nombreEs: string;
  nombreEn: string;
  descripcionEn: string | null;
  precio: number;
  fotoUrl: string | null;
  fotoMiniUrl: string | null;
  agotado: boolean;
  activo: boolean;
};

export const ICONOS = [
  '☕',
  '🍳',
  '🥞',
  '🍛',
  '🍲',
  '🥘',
  '🍚',
  '🍗',
  '🥩',
  '🐟',
  '🦐',
  '🥗',
  '🌮',
  '🍔',
  '🍕',
  '🍝',
  '🍢',
  '🥟',
  '🍰',
  '🍨',
  '🍮',
  '🥤',
  '🧃',
  '🍺',
  '🍷',
  '🍹',
  '🫖',
  '🍽️',
];

// Confirmación dentro de la página (sin ventanas del navegador).
function ConfirmarEnLinea({
  texto,
  onSi,
  onNo,
  ocupado,
}: {
  texto: string;
  onSi: () => void;
  onNo: () => void;
  ocupado?: boolean;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={texto}
      className="flex flex-wrap items-center gap-2 rounded-md bg-danger-soft p-2 text-sm text-danger"
    >
      <span className="flex-1 font-medium">{texto}</span>
      <Boton variante="peligro" onClick={onSi} disabled={ocupado}>
        Sí, eliminar
      </Boton>
      <Boton variante="suave" onClick={onNo}>
        Cancelar
      </Boton>
    </div>
  );
}

function FormCategoria({ inicial, onListo }: { inicial?: Categoria; onListo: () => void }) {
  const qc = useQueryClient();
  const [icono, setIcono] = useState(inicial?.icono ?? '🍽️');
  const [nombreEs, setNombreEs] = useState(inicial?.nombreEs ?? '');
  const [nombreEn, setNombreEn] = useState(inicial?.nombreEn ?? '');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const guardar = useMutation({
    mutationFn: (body: object) =>
      inicial
        ? api(`/categorias/${inicial.id}`, { method: 'PATCH', body })
        : api('/categorias', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categorias'] });
      onListo();
    },
  });
  const enviar = () => {
    const r = categoriaSchema.safeParse({ nombreEs, nombreEn, icono });
    if (!r.success) return setErrores(erroresDe(r.error));
    setErrores({});
    guardar.mutate(r.data);
  };
  return (
    <Tarjeta className="space-y-3 border border-purple">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Ícono</legend>
        <div className="flex flex-wrap gap-1.5">
          {ICONOS.map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={icono === i}
              aria-label={`Ícono ${i}`}
              onClick={() => setIcono(i)}
              className={`grid size-11 place-items-center rounded-md text-2xl ${icono === i ? 'bg-amber shadow-amber' : 'bg-surface-2'}`}
            >
              {i}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Nombre en español"
          value={nombreEs}
          onChange={(e) => setNombreEs(e.target.value)}
          error={errores.nombreEs}
        />
        <Campo
          etiqueta="Nombre en inglés"
          value={nombreEn}
          onChange={(e) => setNombreEn(e.target.value)}
          error={errores.nombreEn}
        />
      </div>
      {guardar.error && <p className="text-sm text-danger">{(guardar.error as Error).message}</p>}
      <div className="flex gap-2">
        <Boton onClick={enviar} disabled={guardar.isPending}>
          {inicial ? 'Guardar' : 'Crear categoría'}
        </Boton>
        <Boton variante="suave" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </Tarjeta>
  );
}

export function MenuPanelPage() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [editandoCat, setEditandoCat] = useState<string | 'nueva' | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api<Categoria[]>('/categorias'),
  });
  const platos = useQuery({ queryKey: ['platos'], queryFn: () => api<PlatoFila[]>('/platos') });
  const restaurante = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<{ moneda: 'CRC' | 'USD' }>('/restaurante'),
  });
  const precio = formatoPrecio(restaurante.data?.moneda ?? 'CRC');
  const seleccion = params.get('categoria') ?? categorias.data?.[0]?.id ?? null;
  const categoria = categorias.data?.find((c) => c.id === seleccion);
  const delaCategoria = platos.data?.filter((p) => p.categoriaId === seleccion) ?? [];

  const accion = useMutation({
    mutationFn: ({
      ruta,
      method = 'PATCH',
      body,
    }: {
      ruta: string;
      method?: string;
      body?: unknown;
    }) => api(ruta, { method, body }),
    onSuccess: () => {
      setErrorAccion(null);
      setBorrando(null);
      qc.invalidateQueries({ queryKey: ['platos'] });
      qc.invalidateQueries({ queryKey: ['categorias'] });
    },
    onError: (e: ErrorApi) =>
      setErrorAccion(
        e.code === 'EN_USO'
          ? 'No se puede borrar: tiene platos o pedidos asociados. Muévalos o desactívela.'
          : e.message,
      ),
  });

  // Orden optimista: se ve al instante y se guarda en el servidor.
  const ordenar = (clave: 'categorias' | 'platos', ruta: string, ids: string[]) => {
    qc.setQueryData<{ id: string }[]>([clave], (lista) => {
      if (!lista) return lista;
      const pos = new Map(ids.map((id, i) => [id, i]));
      return [...lista].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    });
    accion.mutate({ ruta, body: { ids } });
  };

  const duplicar = useMutation({
    mutationFn: (id: string) => api<{ id: string }>(`/platos/${id}/duplicar`, { method: 'POST' }),
    onSuccess: (copia) => {
      qc.invalidateQueries({ queryKey: ['platos'] });
      navegar(`/panel/menu/plato/${copia.id}`);
    },
  });

  if (categorias.isError || platos.isError)
    return (
      <ErrorCarga mensaje="No se pudo cargar el menú" onReintentar={() => qc.invalidateQueries()} />
    );

  return (
    <>
      <TituloPagina
        titulo="Menú"
        detalle="Arrastre para ordenar. Los cambios se ven en el menú del comensal al instante."
        acciones={
          seleccion && (
            <Link
              to={`/panel/menu/plato/nuevo?categoria=${seleccion}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent"
            >
              <Plus className="size-4" aria-hidden /> Nuevo plato
            </Link>
          )
        }
      />
      {errorAccion && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {errorAccion}
        </p>
      )}

      <PromocionDia iconos={new Map(categorias.data?.map((c) => [c.id, c.icono]))} />

      <div className="grid gap-6 lg:grid-cols-[minmax(340px,380px)_1fr]">
        {/* Categorías */}
        <section aria-labelledby="t-categorias">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="t-categorias" className="font-semibold">
              Categorías
            </h2>
            <Boton variante="suave" onClick={() => setEditandoCat('nueva')}>
              <Plus className="size-4" aria-hidden /> Nueva
            </Boton>
          </div>
          {editandoCat === 'nueva' && (
            <div className="mb-2">
              <FormCategoria onListo={() => setEditandoCat(null)} />
            </div>
          )}
          {categorias.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Esqueleto key={i} className="h-14" />
              ))}
            </div>
          ) : categorias.data?.length === 0 ? (
            <EstadoVacio
              titulo="Sin categorías"
              detalle="Cree la primera (por ejemplo «Desayunos») para empezar a agregar platos."
            />
          ) : (
            <ListaOrdenable
              items={categorias.data ?? []}
              onOrdenar={(ids) => ordenar('categorias', '/categorias/orden', ids)}
              render={(c, asa) =>
                editandoCat === c.id ? (
                  <FormCategoria inicial={c} onListo={() => setEditandoCat(null)} />
                ) : borrando === c.id ? (
                  <ConfirmarEnLinea
                    texto={`¿Eliminar la categoría «${c.nombreEs}»?`}
                    ocupado={accion.isPending}
                    onSi={() => accion.mutate({ ruta: `/categorias/${c.id}`, method: 'DELETE' })}
                    onNo={() => setBorrando(null)}
                  />
                ) : (
                  <div
                    className={`flex items-center gap-1 rounded-md bg-app pr-1 ${c.id === seleccion ? 'ring-2 ring-purple' : ''}`}
                  >
                    {asa}
                    <button
                      type="button"
                      onClick={() => setParams({ categoria: c.id })}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-xl"
                      >
                        {c.icono ?? '🍽️'}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block truncate font-medium ${c.activa ? '' : 'text-muted line-through'}`}
                        >
                          {c.nombreEs}
                        </span>
                        <span className="block truncate text-xs text-muted">{c.nombreEn}</span>
                      </span>
                    </button>
                    <Interruptor
                      activo={c.activa}
                      etiqueta={`Categoría ${c.nombreEs} visible`}
                      onCambio={(activa) =>
                        accion.mutate({ ruta: `/categorias/${c.id}`, body: { activa } })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Editar ${c.nombreEs}`}
                      onClick={() => setEditandoCat(c.id)}
                      className="grid size-11 place-items-center rounded-md hover:bg-surface"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${c.nombreEs}`}
                      onClick={() => setBorrando(c.id)}
                      className="grid size-11 place-items-center rounded-md text-danger hover:bg-surface"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                )
              }
            />
          )}
        </section>

        {/* Platos de la categoría */}
        <section aria-labelledby="t-platos">
          <h2 id="t-platos" className="mb-2 font-semibold">
            {categoria ? `${categoria.icono ?? ''} ${categoria.nombreEs}` : 'Platos'}
          </h2>
          {platos.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Esqueleto key={i} className="h-20" />
              ))}
            </div>
          ) : delaCategoria.length === 0 ? (
            <EstadoVacio
              titulo="Esta categoría no tiene platos"
              detalle="Agregue el primero: foto, nombre en español e inglés, precio y sus opciones."
              accion={
                seleccion && (
                  <Link
                    to={`/panel/menu/plato/nuevo?categoria=${seleccion}`}
                    className="mt-2 inline-flex min-h-11 items-center rounded-md bg-purple px-4 text-sm font-semibold text-on-accent"
                  >
                    Nuevo plato
                  </Link>
                )
              }
            />
          ) : (
            <ListaOrdenable
              items={delaCategoria}
              onOrdenar={(ids) => ordenar('platos', '/platos/orden', ids)}
              render={(p, asa) =>
                borrando === p.id ? (
                  <ConfirmarEnLinea
                    texto={`¿Eliminar «${p.nombreEs}»? No se puede deshacer.`}
                    ocupado={accion.isPending}
                    onSi={() => accion.mutate({ ruta: `/platos/${p.id}`, method: 'DELETE' })}
                    onNo={() => setBorrando(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-md bg-app p-2 lg:flex-nowrap">
                    {asa}
                    <FotoPlato
                      fotoUrl={p.fotoMiniUrl ?? p.fotoUrl}
                      icono={categoria?.icono ?? null}
                      tam={56}
                      clase="size-14 shrink-0 rounded-[12px]"
                    />
                    <Link to={`/panel/menu/plato/${p.id}`} className="min-w-[140px] flex-1">
                      <span
                        className={`block truncate font-medium ${p.activo ? '' : 'text-muted'}`}
                      >
                        {p.nombreEs}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                        <span className="tabular-nums">{precio(p.precio)}</span>
                        {!p.activo && <Etiqueta tono="neutro">Oculto</Etiqueta>}
                        {p.agotado && <Etiqueta tono="danger">Agotado</Etiqueta>}
                        {(!p.fotoUrl || !p.descripcionEn) && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-amber-ink"
                            title="Falta foto o traducción"
                          >
                            <TriangleAlert className="size-3.5" aria-hidden />{' '}
                            {!p.fotoUrl ? 'Sin foto' : 'Falta inglés'}
                          </span>
                        )}
                      </span>
                    </Link>
                    <div className="flex items-center gap-3 max-sm:w-full max-sm:justify-end">
                      <span className="flex items-center text-xs text-muted">
                        Agotado
                        <Interruptor
                          activo={p.agotado}
                          etiqueta={`${p.nombreEs} agotado`}
                          onCambio={(agotado) =>
                            accion.mutate({ ruta: `/platos/${p.id}/agotado`, body: { agotado } })
                          }
                        />
                      </span>
                      <span className="flex items-center text-xs text-muted">
                        Visible
                        <Interruptor
                          activo={p.activo}
                          etiqueta={`${p.nombreEs} visible en el menú`}
                          onCambio={(activo) =>
                            accion.mutate({ ruta: `/platos/${p.id}`, body: { activo } })
                          }
                        />
                      </span>
                      <span className="flex">
                        <button
                          type="button"
                          aria-label={`Duplicar ${p.nombreEs}`}
                          onClick={() => duplicar.mutate(p.id)}
                          className="grid size-11 place-items-center rounded-md hover:bg-surface"
                        >
                          <Copy className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar ${p.nombreEs}`}
                          onClick={() => setBorrando(p.id)}
                          className="grid size-11 place-items-center rounded-md text-danger hover:bg-surface"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </span>
                    </div>
                  </div>
                )
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
