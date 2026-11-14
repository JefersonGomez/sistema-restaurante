import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  Printer,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { categoriaSchema } from '@menu-qr/shared';
import { formatoPrecio, FotoPlato } from '@menu-qr/ui';
import { api, descargar, ErrorApi } from '../../api';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  Etiqueta,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from '../comunes';
import { ListaOrdenable } from './Ordenable';
import { PromocionDia } from './PromocionDia';
import { MenusDelDia } from './MenusDelDia';

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
  menuDelDia: boolean;
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

// Guía para empezar: se ve mientras el menú todavía no tiene platos.
function Guia({ hayCategorias }: { hayCategorias: boolean }) {
  const pasos = [
    { texto: 'Cree una categoría', detalle: 'por ejemplo «Desayunos»', hecho: hayCategorias },
    { texto: 'Agregue platos', detalle: 'foto, nombre y precio', hecho: false },
    { texto: 'Revise su menú', detalle: 'con el QR de una mesa', hecho: false },
  ];
  return (
    <ol aria-label="Para empezar" className="mb-4 grid gap-2 sm:grid-cols-3">
      {pasos.map((p, i) => (
        <li
          key={p.texto}
          className="flex items-center gap-3 rounded-md border border-dashed border-line bg-app p-3"
        >
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${p.hecho ? 'bg-ok-soft text-ok' : 'bg-amber-soft text-amber-ink'}`}
          >
            {p.hecho ? <Check className="size-4" aria-label="Hecho" /> : i + 1}
          </span>
          <span className="text-sm">
            <span className="block font-semibold">{p.texto}</span>
            <span className="text-muted">{p.detalle}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MenuPanelPage() {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const enfocada = params.get('categoria');
  const [contraidas, setContraidas] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setContraidas((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
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

  const lista = categorias.data ?? [];
  const hayPlatos = (platos.data?.length ?? 0) > 0;
  const cargando = categorias.isLoading || platos.isLoading;

  // Al volver del formulario de un plato (?categoria=), se muestra su categoría.
  useEffect(() => {
    if (enfocada && lista.length)
      document.getElementById(`cat-${enfocada}`)?.scrollIntoView({ block: 'start' });
  }, [enfocada, lista.length]);

  if (categorias.isError || platos.isError)
    return (
      <ErrorCarga mensaje="No se pudo cargar el menú" onReintentar={() => qc.invalidateQueries()} />
    );

  const filaPlato = (p: PlatoFila, icono: string | null, asa: ReactNode) =>
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
          icono={icono}
          tam={56}
          clase="size-14 shrink-0 rounded-[12px]"
        />
        <Link to={`/panel/menu/plato/${p.id}`} className="min-w-[140px] flex-1">
          <span className={`block truncate font-medium ${p.activo ? '' : 'text-muted'}`}>
            {p.nombreEs}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <span>{precio(p.precio)}</span>
            {p.menuDelDia && <Etiqueta tono="amber">Menú del día</Etiqueta>}
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
          <span className="flex items-center gap-1.5 text-xs text-muted">
            Agotado
            <Interruptor
              activo={p.agotado}
              etiqueta={`${p.nombreEs} agotado`}
              onCambio={(agotado) =>
                accion.mutate({ ruta: `/platos/${p.id}/agotado`, body: { agotado } })
              }
            />
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            Visible
            <Interruptor
              activo={p.activo}
              etiqueta={`${p.nombreEs} visible en el menú`}
              onCambio={(activo) => accion.mutate({ ruta: `/platos/${p.id}`, body: { activo } })}
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
    );

  // Cada categoría es un bloque con sus platos adentro y su propio "+ Agregar plato".
  const bloque = (c: Categoria, asa: ReactNode) => {
    const suyos = platos.data?.filter((p) => p.categoriaId === c.id) ?? [];
    const abierta = !contraidas.has(c.id);
    return (
      <div id={`cat-${c.id}`} className="scroll-mt-4 overflow-hidden rounded-lg border border-line">
        <div className="flex items-center gap-1 bg-surface pr-1">
          {asa}
          <button
            type="button"
            onClick={() => alternar(c.id)}
            aria-expanded={abierta}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-xl"
            >
              {c.icono ?? '🍽️'}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate font-semibold ${c.activa ? '' : 'text-muted line-through'}`}
              >
                {c.nombreEs}
              </span>
              <span className="block truncate text-xs text-muted">
                {c.nombreEn} · {suyos.length === 1 ? '1 plato' : `${suyos.length} platos`}
              </span>
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted transition-transform ${abierta ? '' : '-rotate-90'}`}
              aria-hidden
            />
          </button>
          <Interruptor
            activo={c.activa}
            etiqueta={`Categoría ${c.nombreEs} visible`}
            onCambio={(activa) => accion.mutate({ ruta: `/categorias/${c.id}`, body: { activa } })}
          />
          <button
            type="button"
            aria-label={`Editar ${c.nombreEs}`}
            onClick={() => setEditandoCat(c.id)}
            className="grid size-11 place-items-center rounded-md hover:bg-surface-2"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Eliminar ${c.nombreEs}`}
            onClick={() => setBorrando(c.id)}
            className="grid size-11 place-items-center rounded-md text-danger hover:bg-surface-2"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
        {abierta && (
          <div className="space-y-2 border-t border-line bg-app p-2">
            {suyos.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted">
                Todavía no hay platos en {c.nombreEs}. Agregue el primero con su foto y precio.
              </p>
            ) : (
              <ListaOrdenable
                items={suyos}
                onOrdenar={(ids) => ordenar('platos', '/platos/orden', ids)}
                render={(p, asaPlato) => filaPlato(p, c.icono, asaPlato)}
              />
            )}
            <Link
              to={`/panel/menu/plato/nuevo?categoria=${c.id}`}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-dashed border-line text-sm font-semibold hover:bg-surface"
            >
              <Plus className="size-4" aria-hidden /> Agregar plato a {c.nombreEs}
            </Link>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <TituloPagina
        titulo="Menú"
        detalle="Arrastre para ordenar. Los cambios se ven en el menú del comensal al instante."
        acciones={
          <Boton
            variante="suave"
            onClick={() =>
              descargar('/restaurante/menu.pdf', 'menu.pdf').catch((e: Error) =>
                setErrorAccion(e.message),
              )
            }
          >
            <Printer className="size-4" aria-hidden /> Menú en PDF
          </Boton>
        }
      />
      {errorAccion && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {errorAccion}
        </p>
      )}

      <PromocionDia iconos={new Map(categorias.data?.map((c) => [c.id, c.icono]))} />
      <MenusDelDia categoriaId={categorias.data?.[0]?.id} />

      {!cargando && !hayPlatos && <Guia hayCategorias={lista.length > 0} />}

      <section aria-label="Categorías y platos" className="space-y-3">
        {cargando ? (
          [0, 1, 2].map((i) => <Esqueleto key={i} className="h-40" />)
        ) : (
          <ListaOrdenable
            items={lista}
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
                bloque(c, asa)
              )
            }
          />
        )}
        {editandoCat === 'nueva' ? (
          <FormCategoria onListo={() => setEditandoCat(null)} />
        ) : (
          !cargando && (
            <button
              type="button"
              onClick={() => setEditandoCat('nueva')}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm font-semibold text-muted hover:bg-app hover:text-fg"
            >
              <Plus className="size-4" aria-hidden />
              {lista.length ? 'Nueva categoría' : 'Crear la primera categoría'}
            </button>
          )
        )}
      </section>
    </>
  );
}
