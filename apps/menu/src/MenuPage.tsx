import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import type { GrupoPublico, Idioma, MenuPublico, MesaPublica, PlatoPublico } from '@menu-qr/shared';
import { obtenerMenu, obtenerMesa } from './api';

const TEXTOS = {
  es: {
    mesa: 'Mesa',
    agotado: 'Agotado',
    obligatorio: 'obligatorio',
    elegir: (min: number, max: number) =>
      min === max ? `elegí ${min}` : min > 0 ? `elegí de ${min} a ${max}` : `hasta ${max}`,
    alergenos: 'Alérgenos',
    impuestosIncluidos: (iva: number, serv: number) =>
      `Precios incluyen IVA (${iva}%) y servicio (${serv}%).`,
    impuestosAparte: (iva: number, serv: number) =>
      `Precios no incluyen IVA (${iva}%) ni servicio (${serv}%).`,
    cargando: 'Cargando menú…',
    noEncontrado: 'Este código QR no es válido o la mesa no está disponible.',
    error: 'No pudimos cargar el menú. Intentá de nuevo.',
  },
  en: {
    mesa: 'Table',
    agotado: 'Sold out',
    obligatorio: 'required',
    elegir: (min: number, max: number) =>
      min === max ? `choose ${min}` : min > 0 ? `choose ${min} to ${max}` : `up to ${max}`,
    alergenos: 'Allergens',
    impuestosIncluidos: (iva: number, serv: number) =>
      `Prices include VAT (${iva}%) and service (${serv}%).`,
    impuestosAparte: (iva: number, serv: number) =>
      `Prices exclude VAT (${iva}%) and service (${serv}%).`,
    cargando: 'Loading menu…',
    noEncontrado: 'This QR code is not valid or the table is unavailable.',
    error: "We couldn't load the menu. Please try again.",
  },
} as const;

const CLAVE_IDIOMA = 'menu-idioma';

function idiomaInicial(): Idioma {
  try {
    const guardado = localStorage.getItem(CLAVE_IDIOMA);
    if (guardado === 'es' || guardado === 'en') return guardado;
  } catch {
    // almacenamiento bloqueado
  }
  return navigator.language.startsWith('en') ? 'en' : 'es';
}

const nombre = (x: { nombreEs: string; nombreEn: string }, idioma: Idioma) =>
  idioma === 'en' ? x.nombreEn : x.nombreEs;

export function MenuPage() {
  const { token = '' } = useParams();
  const [mesa, setMesa] = useState<MesaPublica>();
  const [menu, setMenu] = useState<MenuPublico>();
  const [error, setError] = useState<'no-encontrado' | 'error'>();
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaInicial);

  useEffect(() => {
    let vigente = true;
    obtenerMesa(token)
      .then(async (m) => {
        const datos = await obtenerMenu(m.slug);
        if (!vigente) return;
        setMesa(m);
        setMenu(datos);
        document.title = datos.restaurante.nombre;
      })
      .catch(
        (e: Error) => vigente && setError(e.message === 'no-encontrado' ? e.message : 'error'),
      );
    return () => {
      vigente = false;
    };
  }, [token]);

  const setIdioma = (i: Idioma) => {
    setIdiomaState(i);
    try {
      localStorage.setItem(CLAVE_IDIOMA, i);
    } catch {
      // sin almacenamiento: solo dura esta visita
    }
  };

  // Si el restaurante no ofrece el idioma elegido, se usa el primero que tenga.
  const idiomas = menu?.restaurante.idiomas ?? ['es', 'en'];
  const lang: Idioma = idiomas.includes(idioma) ? idioma : (idiomas[0] ?? 'es');
  const t = TEXTOS[lang];

  if (error)
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center text-stone-600">
        <p>{error === 'no-encontrado' ? t.noEncontrado : t.error}</p>
      </main>
    );
  if (!menu || !mesa)
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-stone-500" aria-busy="true">
        <p>{t.cargando}</p>
      </main>
    );

  const r = menu.restaurante;
  const precio = (centimos: number) =>
    new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-CR', {
      style: 'currency',
      currency: r.moneda,
      maximumFractionDigits: r.moneda === 'CRC' ? 0 : 2,
    }).format(centimos / 100);

  return (
    <div
      className="mx-auto min-h-dvh max-w-xl bg-white pb-10 text-stone-800 shadow-sm"
      style={{ '--color-marca': r.colorPrimario } as CSSProperties}
    >
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          {r.logoUrl && (
            <img src={r.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{r.nombre}</h1>
            <p className="text-sm text-stone-500">
              {t.mesa} {mesa.numero}
              {mesa.nombre ? ` · ${mesa.nombre}` : ''}
            </p>
          </div>
          {idiomas.length > 1 && (
            <div
              className="flex rounded-full border border-stone-300 p-0.5 text-sm"
              role="group"
              aria-label="Idioma / Language"
            >
              {idiomas.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdioma(i)}
                  aria-pressed={lang === i}
                  className={`rounded-full px-3 py-1 font-medium uppercase ${
                    lang === i ? 'bg-[var(--color-marca)] text-white' : 'text-stone-600'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 text-sm" aria-label="Categorías">
          {menu.categorias.map((c) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-stone-700 hover:bg-stone-200"
            >
              {nombre(c, lang)}
            </a>
          ))}
        </nav>
      </header>

      <main className="px-4">
        {menu.categorias.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-28 pt-6">
            <h2 className="mb-2 text-base font-semibold tracking-wide text-[var(--color-marca)] uppercase">
              {nombre(c, lang)}
            </h2>
            <ul className="divide-y divide-stone-100">
              {c.platos.map((p) => (
                <Plato key={p.id} plato={p} lang={lang} precio={precio} />
              ))}
            </ul>
          </section>
        ))}
        <p className="mt-8 text-center text-xs text-stone-500">
          {r.preciosIncluyenImpuestos
            ? t.impuestosIncluidos(r.porcentajeIva, r.porcentajeServicio)
            : t.impuestosAparte(r.porcentajeIva, r.porcentajeServicio)}
        </p>
      </main>
    </div>
  );
}

function Plato({
  plato: p,
  lang,
  precio,
}: {
  plato: PlatoPublico;
  lang: Idioma;
  precio: (c: number) => string;
}) {
  const t = TEXTOS[lang];
  const descripcion = lang === 'en' ? p.descripcionEn : p.descripcionEs;
  return (
    <li className={`flex gap-3 py-4 ${p.agotado ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium">{nombre(p, lang)}</h3>
          <span className="shrink-0 font-semibold tabular-nums">{precio(p.precio)}</span>
        </div>
        {descripcion && <p className="mt-1 text-sm text-stone-600">{descripcion}</p>}
        {p.agotado && (
          <span className="mt-2 inline-block rounded bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
            {t.agotado}
          </span>
        )}
        {p.grupos.map((g) => (
          <Grupo key={g.id} grupo={g} lang={lang} precio={precio} />
        ))}
        {p.alergenos.length > 0 && (
          <p className="mt-2 text-xs text-stone-500">
            {t.alergenos}: {p.alergenos.join(', ')}
          </p>
        )}
      </div>
      {p.fotoUrl && (
        <img
          src={p.fotoUrl}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-lg object-cover"
        />
      )}
    </li>
  );
}

function Grupo({
  grupo: g,
  lang,
  precio,
}: {
  grupo: GrupoPublico;
  lang: Idioma;
  precio: (c: number) => string;
}) {
  const t = TEXTOS[lang];
  return (
    <div className="mt-2 text-sm">
      <p className="text-stone-700">
        <span className="font-medium">{nombre(g, lang)}</span>{' '}
        <span className="text-stone-500">
          ({g.obligatorio ? `${t.obligatorio}, ` : ''}
          {t.elegir(g.minimo, g.maximo)})
        </span>
      </p>
      <p className="text-stone-500">
        {g.modificadores
          .map((m) => nombre(m, lang) + (m.precioExtra > 0 ? ` +${precio(m.precioExtra)}` : ''))
          .join(' · ')}
      </p>
    </div>
  );
}
