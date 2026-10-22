import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  guardarGruposSchema,
  platoSchema,
  type Idioma,
  type Moneda,
  type PlatoPublico,
} from '@menu-qr/shared';
import { DishCard, FotoPlato, formatoPrecio, ModifierGroup, UiProvider, useUi } from '@menu-qr/ui';
import { precioConModificadores } from '@menu-qr/shared/seleccion';
import { api, ErrorApi, subirImagen } from '../../api';
import {
  Boton,
  Campo,
  ErrorCarga,
  erroresDe,
  Esqueleto,
  Interruptor,
  Tarjeta,
  TituloPagina,
} from '../comunes';
import { EditorGrupos, type GrupoForm } from './EditorGrupos';
import type { Categoria } from './MenuPanelPage';

const ALERGENOS = [
  'gluten',
  'lácteos',
  'huevo',
  'maní',
  'nueces',
  'pescado',
  'mariscos',
  'soya',
  'sésamo',
];

type PlatoApi = {
  id: string;
  categoriaId: string;
  estacionId: string;
  nombreEs: string;
  nombreEn: string;
  descripcionEs: string | null;
  descripcionEn: string | null;
  precio: number;
  fotoUrl: string | null;
  fotoMiniUrl: string | null;
  agotado: boolean;
  activo: boolean;
  alergenos: string[];
  grupos: (Omit<GrupoForm, 'clave' | 'modificadores'> & {
    id: string;
    modificadores: { id: string; nombreEs: string; nombreEn: string; precioExtra: number }[];
  })[];
};

// "4800" o "4 800,50" (colones) → céntimos. null si no es un monto válido.
const aCentimos = (texto: string) => {
  const limpio = texto.replace(/[\s₡]/g, '').replace(',', '.');
  if (!limpio) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
};
const aColones = (c: number) =>
  c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100);

export function PlatoForm() {
  const { id } = useParams();
  const nuevo = !id || id === 'nuevo';
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const qc = useQueryClient();

  const plato = useQuery({
    queryKey: ['plato', id],
    queryFn: () => api<PlatoApi>(`/platos/${id}`),
    enabled: !nuevo,
  });
  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api<Categoria[]>('/categorias'),
  });
  const estaciones = useQuery({
    queryKey: ['estaciones'],
    queryFn: () => api<{ id: string; nombre: string }[]>('/estaciones'),
  });
  const restaurante = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<{ moneda: Moneda }>('/restaurante'),
  });
  const platosTodos = useQuery({
    queryKey: ['platos'],
    queryFn: () => api<{ categoriaId: string; estacionId: string }[]>('/platos'),
    enabled: nuevo,
  });
  const estacionSugerida = (categoriaId: string) => {
    const uso = new Map<string, number>();
    for (const x of platosTodos.data ?? [])
      if (x.categoriaId === categoriaId) uso.set(x.estacionId, (uso.get(x.estacionId) ?? 0) + 1);
    return [...uso].sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  const [f, setF] = useState({
    categoriaId: params.get('categoria') ?? '',
    estacionId: '',
    nombreEs: '',
    nombreEn: '',
    descripcionEs: '',
    descripcionEn: '',
    precio: '',
    fotoUrl: null as string | null,
    fotoMiniUrl: null as string | null,
    agotado: false,
    activo: true,
    alergenos: [] as string[],
  });
  const [grupos, setGrupos] = useState<GrupoForm[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [otroAlergeno, setOtroAlergeno] = useState('');
  const original = useRef<{ fotoUrl: string | null; fotoMiniUrl: string | null }>({
    fotoUrl: null,
    fotoMiniUrl: null,
  });

  // Carga del plato a editar (una sola vez).
  const cargado = useRef(false);
  useEffect(() => {
    const p = plato.data;
    if (!p || cargado.current) return;
    cargado.current = true;
    original.current = { fotoUrl: p.fotoUrl, fotoMiniUrl: p.fotoMiniUrl };
    setF({
      categoriaId: p.categoriaId,
      estacionId: p.estacionId,
      nombreEs: p.nombreEs,
      nombreEn: p.nombreEn,
      descripcionEs: p.descripcionEs ?? '',
      descripcionEn: p.descripcionEn ?? '',
      precio: aColones(p.precio),
      fotoUrl: p.fotoUrl,
      fotoMiniUrl: p.fotoMiniUrl,
      agotado: p.agotado,
      activo: p.activo,
      alergenos: p.alergenos,
    });
    setGrupos(
      p.grupos.map((g) => ({
        ...g,
        clave: g.id,
        modificadores: g.modificadores.map((m) => ({
          ...m,
          clave: m.id,
          precioExtra: m.precioExtra ? aColones(m.precioExtra) : '',
        })),
      })),
    );
  }, [plato.data]);
  // Valores por defecto al crear: primera categoría/estación.
  useEffect(() => {
    if (!nuevo || !categorias.data || !estaciones.data || !platosTodos.data) return;
    setF((x) => {
      const categoriaId = x.categoriaId || categorias.data?.[0]?.id || '';
      // Estación: la que más usan los platos de esa categoría (si no, la primera).
      const estacionId =
        x.estacionId || estacionSugerida(categoriaId) || estaciones.data?.[0]?.id || '';
      return { ...x, categoriaId, estacionId };
    });
  }, [nuevo, categorias.data, estaciones.data, platosTodos.data]);

  // Al corregir un campo se borra su error.
  const poner = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrores(({ [k]: _quitado, ...resto }) => resto);
  };

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setErrorFoto(null);
    setSubiendo(true);
    try {
      const { url320, url960 } = await subirImagen<{ url320: string; url960: string }>(
        archivo,
        'plato',
      );
      // Una foto subida y reemplazada antes de guardar se borra (la guardada la borra el servidor).
      if (f.fotoUrl && f.fotoUrl !== original.current.fotoUrl)
        for (const url of [f.fotoUrl, f.fotoMiniUrl])
          if (url) api('/uploads/imagen', { method: 'DELETE', body: { url } }).catch(() => {});
      setF((x) => ({ ...x, fotoUrl: url960, fotoMiniUrl: url320 }));
    } catch (e) {
      setErrorFoto((e as Error).message);
    } finally {
      setSubiendo(false);
    }
  };
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    subir(e.dataTransfer.files[0]);
  };

  const guardar = useMutation({
    mutationFn: async () => {
      const precio = aCentimos(f.precio);
      const cuerpo = {
        categoriaId: f.categoriaId,
        estacionId: f.estacionId,
        nombreEs: f.nombreEs,
        nombreEn: f.nombreEn,
        descripcionEs: f.descripcionEs.trim() || null,
        descripcionEn: f.descripcionEn.trim() || null,
        precio: precio ?? -1,
        fotoUrl: f.fotoUrl,
        fotoMiniUrl: f.fotoMiniUrl,
        agotado: f.agotado,
        activo: f.activo,
        alergenos: f.alergenos,
      };
      const gruposCuerpo = {
        grupos: grupos.map(({ clave: _c, modificadores, ...g }) => ({
          ...g,
          modificadores: modificadores.map(({ clave: _k, precioExtra, ...o }) => ({
            ...o,
            precioExtra: aCentimos(precioExtra) ?? -1,
          })),
        })),
      };
      // Validación con los mismos esquemas Zod que usa la API; errores junto a cada campo.
      const r1 = platoSchema.safeParse(cuerpo);
      const r2 = guardarGruposSchema.safeParse(gruposCuerpo);
      const errs = {
        ...(r1.success ? {} : erroresDe(r1.error)),
        ...(r2.success ? {} : erroresDe(r2.error)),
      };
      if (precio === null || !f.precio.trim())
        errs.precio = 'Escriba el precio en colones, por ejemplo 4800';
      setErrores(errs);
      if (Object.keys(errs).length) throw new Error('Revise los campos marcados');

      const guardado = nuevo
        ? await api<{ id: string }>('/platos', { method: 'POST', body: r1.data })
        : await api<{ id: string }>(`/platos/${id}`, { method: 'PATCH', body: r1.data });
      await api(`/platos/${guardado.id}/grupos-modificadores`, { method: 'PUT', body: r2.data });
      return guardado;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platos'] });
      qc.invalidateQueries({ queryKey: ['plato', id] });
      navegar(`/panel/menu?categoria=${f.categoriaId}`);
    },
  });

  if (!nuevo && plato.isError)
    return <ErrorCarga mensaje="No se encontró el plato" onReintentar={() => plato.refetch()} />;
  if (!nuevo && plato.isLoading) return <Esqueleto className="h-96" />;

  const icono = categorias.data?.find((c) => c.id === f.categoriaId)?.icono ?? null;
  const avisos = [
    !f.fotoUrl && 'No tiene foto: los platos con foto se piden más.',
    f.descripcionEs.trim() && !f.descripcionEn.trim() && 'Falta la descripción en inglés.',
  ].filter(Boolean) as string[];
  const errorGeneral =
    guardar.error && !(guardar.error.message === 'Revise los campos marcados')
      ? (guardar.error as ErrorApi).message
      : null;
  const selectClase = 'mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg';

  // Lo que verá el comensal.
  const vistaPrevia: PlatoPublico = {
    id: id ?? 'nuevo',
    nombreEs: f.nombreEs || 'Nombre del plato',
    nombreEn: f.nombreEn || 'Dish name',
    descripcionEs: f.descripcionEs || null,
    descripcionEn: f.descripcionEn || null,
    precio: aCentimos(f.precio) ?? 0,
    fotoUrl: f.fotoUrl,
    fotoMiniUrl: f.fotoMiniUrl,
    agotado: f.agotado,
    precioAntes: null,
    alergenos: f.alergenos,
    grupos: grupos.map((g) => ({
      id: g.clave,
      nombreEs: g.nombreEs || 'Grupo',
      nombreEn: g.nombreEn || 'Group',
      obligatorio: g.obligatorio,
      minimo: g.minimo,
      maximo: g.maximo,
      modificadores: g.modificadores.map((o) => ({
        id: o.clave,
        nombreEs: o.nombreEs || 'Opción',
        nombreEn: o.nombreEn || 'Option',
        precioExtra: aCentimos(o.precioExtra) ?? 0,
      })),
    })),
  };

  return (
    <>
      <TituloPagina
        titulo={nuevo ? 'Nuevo plato' : 'Editar plato'}
        acciones={
          <>
            <Link
              to={`/panel/menu?categoria=${f.categoriaId}`}
              className="inline-flex min-h-11 items-center rounded-md bg-surface px-4 text-sm font-semibold"
            >
              Cancelar
            </Link>
            <Boton onClick={() => guardar.mutate()} disabled={guardar.isPending || subiendo}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Boton>
          </>
        }
      />
      {Object.keys(errores).length > 0 && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">
          Revise los campos marcados en rojo.
        </p>
      )}
      {errorGeneral && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">
          {errorGeneral}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {avisos.length > 0 && (
            <div className="flex gap-2 rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
              <TriangleAlert className="size-5 shrink-0" aria-hidden />
              <ul>
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <Tarjeta className="space-y-3">
            <h2 className="font-semibold">Foto</h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={soltar}
              className="flex flex-wrap items-center gap-4 rounded-md border-2 border-dashed border-line p-4"
            >
              <FotoPlato
                fotoUrl={f.fotoMiniUrl ?? f.fotoUrl}
                icono={icono}
                tam={112}
                clase="size-28 shrink-0 rounded-[16px]"
              />
              <div className="flex flex-1 flex-col gap-2">
                <p className="text-sm text-muted">
                  {subiendo
                    ? 'Subiendo y optimizando…'
                    : 'Arrastre una foto aquí, súbala o tómela con la cámara. JPG, PNG o WEBP, hasta 8 MB.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent">
                    <ImagePlus className="size-4" aria-hidden /> Subir foto
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      className="sr-only"
                      onChange={(e) => subir(e.target.files?.[0])}
                    />
                  </label>
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-surface px-4 text-sm font-semibold">
                    <Camera className="size-4" aria-hidden /> Tomar foto
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => subir(e.target.files?.[0])}
                    />
                  </label>
                  {f.fotoUrl && (
                    <Boton
                      variante="suave"
                      onClick={() => setF((x) => ({ ...x, fotoUrl: null, fotoMiniUrl: null }))}
                    >
                      <Trash2 className="size-4" aria-hidden /> Quitar
                    </Boton>
                  )}
                </div>
                {errorFoto && <p className="text-sm text-danger">{errorFoto}</p>}
              </div>
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <h2 className="font-semibold">Datos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Nombre en español"
                value={f.nombreEs}
                onChange={(e) => poner('nombreEs', e.target.value)}
                error={errores.nombreEs}
              />
              <Campo
                etiqueta="Nombre en inglés"
                value={f.nombreEn}
                onChange={(e) => poner('nombreEn', e.target.value)}
                error={errores.nombreEn}
              />
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium">Descripción en español</span>
                <textarea
                  value={f.descripcionEs}
                  maxLength={500}
                  onChange={(e) => poner('descripcionEs', e.target.value)}
                  className="mt-1 min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-fg"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium">Descripción en inglés</span>
                <textarea
                  value={f.descripcionEn}
                  maxLength={500}
                  onChange={(e) => poner('descripcionEn', e.target.value)}
                  className="mt-1 min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-fg"
                />
              </label>
              <Campo
                etiqueta="Precio (₡)"
                inputMode="decimal"
                placeholder="4800"
                value={f.precio}
                onChange={(e) => poner('precio', e.target.value)}
                error={errores.precio}
              />
              <label className="block text-sm">
                <span className="font-medium">Categoría</span>
                <select
                  value={f.categoriaId}
                  onChange={(e) => poner('categoriaId', e.target.value)}
                  className={selectClase}
                >
                  {categorias.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icono} {c.nombreEs}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium">Se prepara en</span>
                <select
                  value={f.estacionId}
                  onChange={(e) => poner('estacionId', e.target.value)}
                  className={selectClase}
                >
                  {estaciones.data?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-4 text-sm sm:col-span-2">
                <span className="flex items-center">
                  <Interruptor
                    activo={f.activo}
                    etiqueta="Visible en el menú"
                    onCambio={(v) => poner('activo', v)}
                  />{' '}
                  Visible en el menú
                </span>
                <span className="flex items-center">
                  <Interruptor
                    activo={f.agotado}
                    etiqueta="Agotado"
                    onCambio={(v) => poner('agotado', v)}
                  />{' '}
                  Agotado
                </span>
              </div>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Alérgenos</legend>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...ALERGENOS, ...f.alergenos])].map((a) => {
                  const on = f.alergenos.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        poner(
                          'alergenos',
                          on ? f.alergenos.filter((x) => x !== a) : [...f.alergenos, a],
                        )
                      }
                      className={`min-h-11 rounded-full px-4 text-sm ${on ? 'bg-purple text-on-accent' : 'bg-surface'}`}
                    >
                      {a}
                    </button>
                  );
                })}
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const a = otroAlergeno.trim().toLowerCase();
                    if (a && !f.alergenos.includes(a)) poner('alergenos', [...f.alergenos, a]);
                    setOtroAlergeno('');
                  }}
                >
                  <input
                    value={otroAlergeno}
                    onChange={(e) => setOtroAlergeno(e.target.value)}
                    placeholder="Otro…"
                    aria-label="Otro alérgeno"
                    className="h-11 w-28 rounded-full border border-line bg-surface px-4 text-sm"
                  />
                </form>
              </div>
            </fieldset>
          </Tarjeta>

          <section className="space-y-2">
            <h2 className="font-semibold">Opciones y modificadores</h2>
            <p className="text-sm text-muted">
              Ej.: «Término de la carne» obligatorio con una opción, o «Extras» opcional con precio.
            </p>
            <EditorGrupos grupos={grupos} onCambio={setGrupos} errores={errores} />
          </section>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <h2 className="mb-2 font-semibold">Vista previa en el celular</h2>
          <VistaPrevia
            plato={vistaPrevia}
            icono={icono}
            moneda={restaurante.data?.moneda ?? 'CRC'}
          />
        </aside>
      </div>
    </>
  );
}

// El plato tal como lo verá el comensal (mismos componentes del menú), en español o inglés.
function VistaPrevia({
  plato,
  icono,
  moneda,
}: {
  plato: PlatoPublico;
  icono: string | null;
  moneda: Moneda;
}) {
  const [idioma, setIdioma] = useState<Idioma>('es');
  return (
    <div className="mx-auto max-w-[380px] overflow-hidden rounded-[32px] border-8 border-fg bg-app shadow-app">
      <div className="flex justify-end gap-1 p-3">
        {(['es', 'en'] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={idioma === i}
            onClick={() => setIdioma(i)}
            className={`min-h-11 rounded-full px-4 text-xs font-semibold uppercase ${idioma === i ? 'bg-purple text-on-accent' : 'bg-surface'}`}
          >
            {i}
          </button>
        ))}
      </div>
      <UiProvider idioma={idioma}>
        <Detalle plato={plato} icono={icono} moneda={moneda} />
      </UiProvider>
    </div>
  );
}

function Detalle({
  plato,
  icono,
  moneda,
}: {
  plato: PlatoPublico;
  icono: string | null;
  moneda: Moneda;
}) {
  const { idioma, t } = useUi();
  const [elegidos, setElegidos] = useState<string[]>([]);
  const precio = formatoPrecio(moneda);
  const descripcion = idioma === 'en' ? plato.descripcionEn : plato.descripcionEs;
  return (
    <div className="space-y-4 px-4 pb-6">
      <DishCard plato={plato} icono={icono} precio={precio} puedePedir onAbrir={() => {}} />
      <div className="overflow-hidden rounded-lg bg-surface">
        <FotoPlato
          fotoUrl={plato.fotoUrl}
          icono={icono}
          tam={160}
          clase="h-40 w-full text-[80px]"
        />
        <div className="p-4">
          <p className="text-lg font-semibold">
            {idioma === 'en' ? plato.nombreEn : plato.nombreEs}
          </p>
          {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
          {plato.grupos.map((g) => (
            <ModifierGroup
              key={g.id}
              grupo={g}
              elegidos={elegidos}
              error={false}
              precio={precio}
              onCambio={setElegidos}
              refGrupo={() => {}}
            />
          ))}
          <p className="mt-4 rounded-md bg-purple py-3 text-center font-semibold text-on-accent">
            {t.agregar} · {precio(precioConModificadores(plato.precio, plato.grupos, elegidos))}
          </p>
        </div>
      </div>
    </div>
  );
}
