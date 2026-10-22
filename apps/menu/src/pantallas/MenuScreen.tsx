import { useMemo, useState } from 'react';
import type { PlatoPublico } from '@menu-qr/shared';
import { useLlamadas } from '../datos/acciones';
import { useMesa } from '../datos/mesa';
import {
  DishSheet,
  CategoryGrid,
  DishCard,
  Header,
  PromoBanner,
  SearchBar,
  formatoHora,
  formatoPrecio,
  nombreEn,
  normalizar,
} from '@menu-qr/ui';
import { Main } from '../componentes/estructura';
import { avisar } from '../estado/avisos';
import { useCarrito } from '../estado/carrito';
import { useIdioma, useTextos } from '../estado/idioma';

export function MenuScreen() {
  const { menu, mesa } = useMesa();
  const t = useTextos();
  const { idioma, alternar: alternarIdioma } = useIdioma();
  const agregar = useCarrito((s) => s.agregar);
  const { llamar } = useLlamadas();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<PlatoPublico | null>(null);

  const r = menu!.restaurante;
  const precio = formatoPrecio(r.moneda);
  const iconoDe = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of menu!.categorias) for (const p of c.platos) m.set(p.id, c.icono);
    return m;
  }, [menu]);

  const q = normalizar(busqueda);
  const platos = menu!.categorias
    .filter((c) => !categoria || c.id === categoria)
    .flatMap((c) => c.platos)
    .filter((p) => !q || normalizar(`${p.nombreEs} ${p.nombreEn}`).includes(q));
  const destacado = menu!.categorias
    .flatMap((c) => c.platos)
    .find((p) => p.destacado && !p.agotado);
  const nombreCategoria = menu!.categorias.find((c) => c.id === categoria);

  return (
    <Main>
      <Header
        restaurante={r}
        mesa={mesa!.numero}
        onLlamar={llamar}
        onCambiarIdioma={alternarIdioma}
      />
      <SearchBar valor={busqueda} onCambio={setBusqueda} />
      {!r.abierto && r.horaApertura && r.horaCierre && (
        <p role="status" className="rounded-md bg-danger-soft px-4 py-3 text-[13px] text-danger">
          {t.cerradoBanner(formatoHora(r.horaApertura, idioma), formatoHora(r.horaCierre, idioma))}
        </p>
      )}
      {!q && destacado && (
        <PromoBanner
          plato={destacado}
          icono={iconoDe.get(destacado.id) ?? null}
          precio={precio}
          onAbrir={() => setAbierto(destacado)}
        />
      )}
      <h2 className="text-[17px] font-semibold">{t.categorias}</h2>
      <CategoryGrid categorias={menu!.categorias} activa={categoria} onElegir={setCategoria} />
      <h2 className="text-[17px] font-semibold">
        {nombreCategoria ? nombreEn(nombreCategoria, idioma) : t.todo}
      </h2>
      <div className="flex flex-col gap-3">
        {platos.length ? (
          platos.map((p) => (
            <DishCard
              key={p.id}
              plato={p}
              icono={iconoDe.get(p.id) ?? null}
              precio={precio}
              puedePedir={r.abierto}
              onAbrir={() => setAbierto(p)}
            />
          ))
        ) : (
          <p className="px-2.5 py-8 text-center text-muted">{t.sinResultados}</p>
        )}
      </div>

      {abierto && (
        <DishSheet
          plato={abierto}
          icono={iconoDe.get(abierto.id) ?? null}
          precio={precio}
          puedePedir={r.abierto}
          onCerrar={() => setAbierto(null)}
          onAgregar={(l) => {
            agregar(l);
            setAbierto(null);
            avisar(t.agregado);
          }}
        />
      )}
    </Main>
  );
}
