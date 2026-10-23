import { Bell, MapPin, Navigation, Phone, Plus, Search } from 'lucide-react';
import { comoLlegar, mapaIncrustado } from '@menu-qr/shared/mapa';
import type { MenuPublico, PlatoPublico } from '@menu-qr/shared';
import { useUi } from './contexto';
import { formatoHora, nombreEn } from './util';

type Restaurante = MenuPublico['restaurante'];
type Categoria = MenuPublico['categorias'][number];

export function Pastilla({
  tono,
  children,
}: {
  tono: 'amber' | 'purple' | 'danger';
  children: React.ReactNode;
}) {
  const estilos = {
    amber: 'bg-amber-soft text-amber-ink',
    purple: 'bg-purple-soft text-purple',
    danger: 'bg-danger-soft text-danger',
  };
  return (
    <span className={`rounded-full px-3 py-[5px] text-[12.5px] font-medium ${estilos[tono]}`}>
      {children}
    </span>
  );
}

export function Header({
  restaurante: r,
  mesa,
  onLlamar,
  onCambiarIdioma,
}: {
  restaurante: Restaurante;
  mesa: number;
  onLlamar: () => void;
  onCambiarIdioma: () => void;
}) {
  const { t } = useUi();
  const { idioma } = useUi();
  // Turnos de hoy: "7:00 a. m. a 9:00 p. m." (varios turnos separados por " · ").
  const horario = r.horarioHoy.length
    ? r.horarioHoy
        .map((h) => t.horario(formatoHora(h.abre, idioma), formatoHora(h.cierra, idioma)))
        .join(' · ')
    : null;
  return (
    <>
      {/* Portada del restaurante (personalización): banner a todo lo ancho en el celular. */}
      {r.bannerUrl && (
        <div className="relative -mx-5 -mt-[22px] aspect-[16/7] overflow-hidden bg-surface-2 md:mx-0 md:mt-0 md:aspect-[16/5] md:rounded-lg">
          <img
            src={r.bannerUrl}
            alt=""
            width={1600}
            height={600}
            className="size-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {r.logoUrl && (
            <img
              src={r.logoUrl}
              alt=""
              width={72}
              height={72}
              className={`size-[72px] shrink-0 rounded-full bg-app object-cover shadow-tarjeta ring-4 ring-app ${r.bannerUrl ? 'relative -mt-12' : ''}`}
            />
          )}
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-balance">
              {r.nombre}
            </h1>
            {r.eslogan && <p className="mt-0.5 text-[13.5px] text-muted">{r.eslogan}</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
              <Pastilla tono={r.abierto ? 'amber' : 'danger'}>
                {r.abierto ? t.abierto : t.cerrado}
              </Pastilla>
              {horario && <span>{horario}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          {r.idiomas.length > 1 && (
            <button
              type="button"
              onClick={onCambiarIdioma}
              aria-label={t.cambiarIdioma}
              className="grid size-11 place-items-center rounded-[14px] text-xs font-semibold tracking-[0.04em] hover:bg-surface"
            >
              {t.idiomaCorto}
            </button>
          )}
          <button
            type="button"
            onClick={onLlamar}
            aria-label={t.llamarMesero}
            className="grid size-11 place-items-center rounded-[14px] text-amber hover:bg-surface"
          >
            <Bell className="size-[22px]" strokeWidth={1.9} aria-hidden />
          </button>
        </div>
      </div>
      <div className="-mt-2 flex">
        <Pastilla tono="purple">
          {t.mesa} {mesa}
        </Pastilla>
      </div>
    </>
  );
}

export function SearchBar({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const { t } = useUi();
  return (
    <label className="flex h-[52px] items-center gap-2.5 rounded-md bg-surface px-4">
      <Search className="size-[22px] shrink-0 text-muted" strokeWidth={1.9} aria-hidden />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={t.buscar}
        aria-label={t.buscar}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-muted"
      />
    </label>
  );
}

export function PromoBanner({
  plato,
  texto,
  icono,
  precio,
  onAbrir,
  color = null,
}: {
  plato: PlatoPublico;
  texto: string | null; // texto de la promoción en el idioma actual
  color?: string | null; // fondo elegido por el dueño (null = el oscuro del diseño)

  icono: string | null;
  precio: (c: number) => string;
  onAbrir: () => void;
}) {
  const { t } = useUi();
  const { idioma } = useUi();
  return (
    <button
      type="button"
      onClick={onAbrir}
      style={color ? { background: color } : undefined}
      className="relative flex min-h-[150px] w-full items-center overflow-hidden rounded-lg bg-banner p-5 md:min-h-[190px] md:px-8 md:before:w-[340px] text-left text-banner-fg before:absolute before:-top-[30px] before:-right-10 before:h-[260px] before:w-[190px] before:rotate-[24deg] before:bg-amber before:opacity-95 before:content-['']"
    >
      <span className="relative z-[1] flex max-w-[60%] flex-col gap-0.5">
        <small className="text-[15px] opacity-90">{texto || t.destacado}</small>
        <strong className="text-[23px] leading-[1.1] font-bold tracking-[0.02em] uppercase">
          {nombreEn(plato, idioma)}
        </strong>
        <span className="mt-2.5 self-start rounded-lg border border-dashed border-amber bg-banner-chip px-3.5 py-1 text-[21px] font-bold text-banner-price tabular-nums">
          {precio(plato.precio)}
          {plato.precioAntes != null && (
            <s className="ml-2 text-[13px] font-medium text-banner-fg opacity-70">
              {precio(plato.precioAntes)}
            </s>
          )}
        </span>
      </span>
      {plato.fotoUrl ? (
        <img
          src={plato.fotoUrl}
          alt=""
          width={120}
          height={120}
          className="absolute right-3.5 bottom-2 z-[1] size-[120px] rounded-full object-cover [filter:drop-shadow(var(--sombra-arte))]"
        />
      ) : (
        <span
          aria-hidden
          className="absolute right-3.5 bottom-2 z-[1] text-[84px] [filter:drop-shadow(var(--sombra-arte))]"
        >
          {icono ?? '🍽️'}
        </span>
      )}
    </button>
  );
}

export function CategoryGrid({
  categorias,
  activa,
  onElegir,
}: {
  categorias: Categoria[];
  activa: string | null;
  onElegir: (id: string | null) => void;
}) {
  const { idioma } = useUi();
  return (
    <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5 sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
      {categorias.map((c) => {
        const on = c.id === activa;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            // Tocar la activa de nuevo la desactiva y muestra todo.
            onClick={() => onElegir(on ? null : c.id)}
            className={`group flex flex-col items-center gap-2 text-[12.5px] ${on ? 'font-medium text-fg' : 'text-muted'}`}
          >
            <span
              aria-hidden
              className={`grid aspect-square w-full max-w-[76px] place-items-center rounded-[20px] text-[32px] transition-transform group-hover:-translate-y-0.5 ${
                on ? 'bg-amber shadow-amber' : 'bg-surface-2'
              }`}
            >
              {c.icono ?? '🍽️'}
            </span>
            <span className="text-center leading-tight">{nombreEn(c, idioma)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Foto del plato o, si no hay, el ícono de su categoría (tamaño fijo: no hay saltos al cargar).
export function FotoPlato({
  fotoUrl,
  icono,
  tam,
  clase,
}: {
  fotoUrl: string | null;
  icono: string | null;
  tam: number;
  clase: string;
}) {
  return fotoUrl ? (
    <img
      src={fotoUrl}
      alt=""
      loading="lazy"
      decoding="async"
      width={tam}
      height={tam}
      className={`${clase} object-cover`}
    />
  ) : (
    <span
      aria-hidden
      className={`${clase} grid place-items-center bg-surface-2`}
      style={{ fontSize: tam / 2 }}
    >
      {icono ?? '🍽️'}
    </span>
  );
}

export function DishCard({
  plato: p,
  icono,
  precio,
  puedePedir,
  onAbrir,
}: {
  plato: PlatoPublico;
  icono: string | null;
  precio: (c: number) => string;
  puedePedir: boolean;
  onAbrir: () => void;
}) {
  const { t } = useUi();
  const { idioma } = useUi();
  const descripcion = idioma === 'en' ? p.descripcionEn : p.descripcionEs;
  return (
    <button
      type="button"
      onClick={() => !p.agotado && onAbrir()}
      aria-disabled={p.agotado || undefined}
      aria-label={p.agotado ? `${nombreEn(p, idioma)} · ${t.agotado}` : undefined}
      className={`flex w-full items-center gap-3.5 rounded-md bg-surface p-3 text-left ${p.agotado ? 'cursor-not-allowed opacity-55' : ''}`}
    >
      <FotoPlato
        fotoUrl={p.fotoMiniUrl ?? p.fotoUrl}
        icono={icono}
        tam={84}
        clase="size-[84px] shrink-0 rounded-[14px]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-[15px] font-semibold">{nombreEn(p, idioma)}</h3>
        {descripcion && (
          <p className="line-clamp-2 text-[12.5px] leading-[1.45] text-muted">{descripcion}</p>
        )}
        <span className="mt-1 flex items-center justify-between">
          <span className="font-semibold tabular-nums">
            {precio(p.precio)}
            {p.precioAntes != null && (
              <s className="ml-1.5 text-xs font-normal text-muted">{precio(p.precioAntes)}</s>
            )}
          </span>
          {p.agotado ? (
            <span className="rounded-full bg-danger-soft px-[9px] py-[3px] text-[11.5px] font-semibold text-danger">
              {t.agotado}
            </span>
          ) : (
            <span
              aria-hidden
              className={`grid size-[34px] place-items-center rounded-sm bg-purple text-on-accent ${puedePedir ? '' : 'opacity-40'}`}
            >
              <Plus className="size-4" strokeWidth={1.9} />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

// "Encuéntrenos": dirección, teléfono, mapa incrustado (sin clave de Google) y "Cómo llegar".
export function InfoLocal({ restaurante: r }: { restaurante: Restaurante }) {
  const { t } = useUi();
  const llegar = comoLlegar(r.ubicacionUrl, r.direccion);
  if (!r.direccion && !r.telefono && !llegar) return null;
  return (
    <section aria-labelledby="encuentrenos" className="overflow-hidden rounded-lg bg-surface">
      {r.direccion && (
        <iframe
          title={t.mapaDe(r.nombre)}
          src={mapaIncrustado(`${r.nombre}, ${r.direccion}`)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-52 w-full border-0 md:h-64"
        />
      )}
      <div className="flex flex-col gap-3 p-4">
        <h2 id="encuentrenos" className="text-[17px] font-semibold">
          {t.encuentrenos}
        </h2>
        {r.direccion && (
          <p className="flex items-start gap-2 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {r.direccion}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {llegar && (
            <a
              href={llegar}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-purple px-4 text-sm font-semibold text-on-accent"
            >
              <Navigation className="size-4" aria-hidden /> {t.comoLlegar}
            </a>
          )}
          {r.telefono && (
            <a
              href={`tel:${r.telefono.replace(/[^0-9+]/g, '')}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-app px-4 text-sm font-semibold"
            >
              <Phone className="size-4" aria-hidden /> {r.telefono}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
