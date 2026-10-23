import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pencil } from 'lucide-react';
import { useState } from 'react';
import {
  acentoLegible,
  restauranteConfigSchema,
  type Idioma,
  type Moneda,
  type PlatoPublico,
} from '@menu-qr/shared';
import { formatoPrecio, PromoBanner } from '@menu-qr/ui';
import { api, type ErrorApi } from '../../api';
import { Boton, Campo, erroresDe, Tarjeta } from '../comunes';
import { aCentimos, aColones } from './PlatoForm';

type Config = {
  moneda: Moneda;
  idiomas: Idioma[];
  platoDestacadoId: string | null;
  textoPromoEs: string | null;
  textoPromoEn: string | null;
  precioPromo: number | null;
  colorPromo: string | null;
};
type Plato = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  precio: number;
  fotoUrl: string | null;
  categoriaId: string;
};
const OSCURO = '#17131f'; // fondo del banner en el diseño

// "Promoción del día": un plato destacado en el banner del menú, con precio especial (ese es el
// que se cobra) y el color de fondo que elija el dueño.
export function PromocionDia({ iconos }: { iconos: Map<string, string | null> }) {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ['restaurante'],
    queryFn: () => api<Config>('/restaurante'),
  });
  const platos = useQuery({ queryKey: ['platos'], queryFn: () => api<Plato[]>('/platos') });
  const [editando, setEditando] = useState(false);

  const c = config.data;
  if (!c || !platos.data) return null;
  const plato = platos.data.find((p) => p.id === c.platoDestacadoId);
  const precio = formatoPrecio(c.moneda);

  if (!editando)
    return (
      <Tarjeta className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-soft text-amber-ink">
          <Megaphone className="size-5" aria-hidden />
        </span>
        <div className="min-w-[200px] flex-1">
          <p className="font-semibold">Promoción del día</p>
          <p className="text-sm text-muted">
            {plato
              ? `${c.textoPromoEs ?? 'Destacado'} ${plato.nombreEs}${c.precioPromo != null ? ` · ${precio(c.precioPromo)}` : ''}`
              : 'Sin promoción: el banner no se muestra.'}
          </p>
        </div>
        <Boton variante={plato ? 'suave' : 'principal'} onClick={() => setEditando(true)}>
          <Pencil className="size-4" aria-hidden /> {plato ? 'Editar' : 'Agregar promoción'}
        </Boton>
      </Tarjeta>
    );
  return (
    <Editor
      c={c}
      platos={platos.data}
      iconos={iconos}
      onListo={() => {
        setEditando(false);
        qc.invalidateQueries({ queryKey: ['restaurante'] });
      }}
    />
  );
}

function Editor({
  c,
  platos,
  iconos,
  onListo,
}: {
  c: Config;
  platos: Plato[];
  iconos: Map<string, string | null>;
  onListo: () => void;
}) {
  const [f, setF] = useState({
    platoDestacadoId: c.platoDestacadoId ?? '',
    textoPromoEs: c.textoPromoEs ?? '',
    textoPromoEn: c.textoPromoEn ?? '',
    precioPromo: c.precioPromo === null ? '' : aColones(c.precioPromo),
    colorPromo: c.colorPromo,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const poner = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };
  const guardar = useMutation({
    mutationFn: (body: object) => api('/restaurante', { method: 'PATCH', body }),
    onSuccess: onListo,
    onError: (e: ErrorApi) => setErrores({ general: e.message }),
  });
  const enviar = (quitar = false) => {
    if (quitar) return guardar.mutate({ platoDestacadoId: null, precioPromo: null });
    const precioPromo = f.precioPromo.trim() ? aCentimos(f.precioPromo) : null;
    if (precioPromo === null && f.precioPromo.trim())
      return setErrores({ precioPromo: 'Escriba el precio en colones, por ejemplo 3500' });
    const r = restauranteConfigSchema.safeParse({
      platoDestacadoId: f.platoDestacadoId || null,
      textoPromoEs: f.textoPromoEs.trim() || null,
      textoPromoEn: f.textoPromoEn.trim() || null,
      precioPromo: f.platoDestacadoId ? precioPromo : null,
      colorPromo: f.colorPromo,
    });
    if (!r.success) return setErrores(erroresDe(r.error));
    guardar.mutate(r.data);
  };

  const plato = platos.find((p) => p.id === f.platoDestacadoId);
  const fondo = f.colorPromo ?? OSCURO;
  const legible = acentoLegible(fondo);
  const precioPromo = aCentimos(f.precioPromo);
  // Vista previa con el mismo banner que ve el cliente.
  const previa =
    plato &&
    ({
      ...plato,
      precio: f.precioPromo.trim() && precioPromo ? precioPromo : plato.precio,
      precioAntes:
        f.precioPromo.trim() && precioPromo && precioPromo !== plato.precio ? plato.precio : null,
    } as unknown as PlatoPublico);

  return (
    <Tarjeta className="mb-6 space-y-4 border border-purple">
      <div>
        <h2 className="font-semibold">Promoción del día</h2>
        <p className="text-sm text-muted">
          Aparece como banner arriba del menú. Si pone precio de promoción, ese es el que se cobra.
        </p>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Plato en promoción</span>
        <select
          value={f.platoDestacadoId}
          onChange={(e) => poner('platoDestacadoId', e.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-fg"
        >
          <option value="">Elija un plato</option>
          {platos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombreEs}
            </option>
          ))}
        </select>
      </label>
      {plato && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo
              etiqueta="Texto (español)"
              maxLength={80}
              placeholder="Jueves de"
              value={f.textoPromoEs}
              onChange={(e) => poner('textoPromoEs', e.target.value)}
              error={errores.textoPromoEs}
            />
            {c.idiomas.includes('en') && (
              <Campo
                etiqueta="Texto (inglés)"
                maxLength={80}
                placeholder="Thursday special"
                value={f.textoPromoEn}
                onChange={(e) => poner('textoPromoEn', e.target.value)}
                error={errores.textoPromoEn}
              />
            )}
            <Campo
              etiqueta="Precio de promoción (opcional)"
              inputMode="decimal"
              placeholder={aColones(plato.precio)}
              value={f.precioPromo}
              onChange={(e) => poner('precioPromo', e.target.value)}
              error={errores.precioPromo}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block font-medium">Color de fondo</span>
              <input
                type="color"
                aria-label="Color de fondo del banner"
                value={fondo}
                onChange={(e) => poner('colorPromo', e.target.value)}
                className="mt-1 h-11 w-16 cursor-pointer rounded-md border border-line bg-surface"
              />
            </label>
            <Campo
              etiqueta="Código"
              className="w-32"
              value={f.colorPromo ?? ''}
              placeholder={OSCURO}
              onChange={(e) => poner('colorPromo', e.target.value || null)}
            />
            {f.colorPromo && (
              <Boton variante="suave" onClick={() => poner('colorPromo', null)}>
                Usar el oscuro original
              </Boton>
            )}
          </div>
          {(errores.colorPromo || !legible) && (
            <p role="alert" className="text-sm text-danger">
              {errores.colorPromo ??
                'Ese color no contrasta con el texto blanco; elija uno más oscuro'}
            </p>
          )}
          {previa && (
            <div className="pointer-events-none max-w-md">
              <PromoBanner
                plato={previa}
                texto={f.textoPromoEs.trim() || null}
                icono={iconos.get(plato.categoriaId) ?? null}
                precio={formatoPrecio(c.moneda)}
                color={f.colorPromo}
                onAbrir={() => {}}
              />
            </div>
          )}
        </>
      )}
      {errores.general && <p className="text-sm text-danger">{errores.general}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton onClick={() => enviar()} disabled={guardar.isPending || !plato || !legible}>
          Guardar promoción
        </Boton>
        {c.platoDestacadoId && (
          <Boton variante="suave" onClick={() => enviar(true)} disabled={guardar.isPending}>
            Quitar promoción
          </Boton>
        )}
        <Boton variante="suave" onClick={onListo}>
          Cancelar
        </Boton>
      </div>
    </Tarjeta>
  );
}
