import { useQuery } from '@tanstack/react-query';
import { Bike, ShoppingBag, ShoppingCart, Store } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import type { MenuPublico, PlatoPublico } from '@menu-qr/shared';
import { calcularTotales } from '@menu-qr/shared/totales';
import {
  Cargando,
  CategoryGrid,
  DishCard,
  DishSheet,
  Header,
  InfoLocal,
  normalizar,
  PromoBanner,
  SearchBar,
  SeccionMenuDelDia,
  formatoPrecio,
  nombreEn,
} from '@menu-qr/ui';
import * as api from '../api';
import { guardar, leer } from '../almacen';
import { CartItem, TotalsSummary } from '../componentes/cuenta';
import { BarraTitulo, ErrorScreen, Main, Toast } from '../componentes/estructura';
import { avisar } from '../estado/avisos';
import { useCarrito } from '../estado/carrito';
import { useIdioma, useTextos } from '../estado/idioma';

type Restaurante = MenuPublico['restaurante'];
const TELEFONO = /^[0-9 +()-]{8,20}$/;
const nuevoId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');

// Pedidos en línea (sin mesa): /r/:slug (menú) y /r/:slug/pedido (datos y envío).
export function RutaEnLinea() {
  const { slug = '' } = useParams();
  const t = useTextos();
  const menuQ = useQuery({
    queryKey: ['menu', slug],
    queryFn: () => api.obtenerMenu(slug),
    staleTime: 60_000,
    retry: (n, e) => !(e instanceof api.ErrorApi && e.status === 404) && n < 2,
  });
  const menu = menuQ.data;

  useEffect(() => {
    useCarrito.getState().cargar(`enlinea:${slug}`);
  }, [slug]);
  useEffect(() => {
    if (!menu) return;
    document.title = menu.restaurante.nombre;
    const acento = menu.restaurante.colorAcento;
    if (acento) {
      document.documentElement.style.setProperty('--purple', acento);
      document.documentElement.style.setProperty(
        '--purple-soft',
        `color-mix(in srgb, ${acento} 14%, transparent)`,
      );
    }
  }, [menu]);

  if (menuQ.error instanceof api.ErrorApi && menuQ.error.status === 404)
    return <ErrorScreen tipo="noEncontrado" />;
  if (menuQ.isError) return <ErrorScreen tipo="error" onReintentar={() => menuQ.refetch()} />;
  if (!menu) return <Cargando texto={t.cargandoMenu} />;
  if (!menu.restaurante.enLinea.activo)
    return (
      <Main>
        <p className="my-auto py-16 text-center text-muted">{t.enLineaInactivo}</p>
      </Main>
    );
  return (
    <>
      <Routes>
        <Route index element={<MenuEnLinea menu={menu} slug={slug} />} />
        <Route path="pedido" element={<PedidoEnLinea menu={menu} slug={slug} />} />
      </Routes>
      <Toast />
    </>
  );
}

function MenuEnLinea({ menu, slug }: { menu: MenuPublico; slug: string }) {
  const t = useTextos();
  const { idioma, alternar } = useIdioma();
  const { lineas, agregar } = useCarrito();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<PlatoPublico | null>(null);
  const r = menu.restaurante;
  const precio = formatoPrecio(r.moneda);
  const iconoDe = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of menu.categorias) for (const p of c.platos) m.set(p.id, c.icono);
    for (const p of menu.menuDelDia) m.set(p.id, p.icono);
    return m;
  }, [menu]);
  const q = normalizar(busqueda);
  const platos = menu.categorias
    .filter((c) => !categoria || c.id === categoria)
    .flatMap((c) => c.platos)
    .filter((p) => !q || normalizar(`${p.nombreEs} ${p.nombreEn}`).includes(q));
  const promo = menu.promocion;
  const destacado = promo
    ? menu.categorias.flatMap((c) => c.platos).find((p) => p.id === promo.platoId && !p.agotado)
    : undefined;
  const nombreCategoria = menu.categorias.find((c) => c.id === categoria);
  const unidades = lineas.reduce((n, l) => n + l.cantidad, 0);
  const subtotal = lineas.reduce((n, l) => n + l.precioUnitario * l.cantidad, 0);

  return (
    <Main>
      <Header restaurante={r} onCambiarIdioma={alternar} />
      <SearchBar valor={busqueda} onCambio={setBusqueda} />
      {!r.abierto && (
        <p role="status" className="rounded-md bg-danger-soft px-4 py-3 text-[13px] text-danger">
          {r.cerradoManual ? t.cerradoTemporal : t.cerradoBanner}
        </p>
      )}
      {!q && destacado && (
        <PromoBanner
          plato={destacado}
          texto={(idioma === 'en' ? promo?.textoEn : promo?.textoEs) ?? null}
          color={promo?.color ?? null}
          icono={iconoDe.get(destacado.id) ?? null}
          precio={precio}
          onAbrir={() => setAbierto(destacado)}
        />
      )}
      {!q && (
        <SeccionMenuDelDia
          platos={menu.menuDelDia}
          precio={precio}
          puedePedir={r.abierto}
          onAbrir={setAbierto}
        />
      )}
      <h2 className="text-[17px] font-semibold">{t.categorias}</h2>
      <CategoryGrid categorias={menu.categorias} activa={categoria} onElegir={setCategoria} />
      <h2 className="text-[17px] font-semibold">
        {nombreCategoria ? nombreEn(nombreCategoria, idioma) : t.todo}
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {platos.map((p) => (
          <DishCard
            key={p.id}
            plato={p}
            icono={iconoDe.get(p.id) ?? null}
            precio={precio}
            puedePedir={r.abierto}
            onAbrir={() => setAbierto(p)}
          />
        ))}
        {platos.length === 0 && (
          <p className="col-span-full px-2.5 py-8 text-center text-muted">{t.sinResultados}</p>
        )}
      </div>
      {!q && <InfoLocal restaurante={r} />}

      {/* Botón fijo con lo que lleva el pedido. */}
      {unidades > 0 && (
        <Link
          to={`/r/${slug}/pedido`}
          className="anim-entrar sticky bottom-[calc(16px+env(safe-area-inset-bottom))] z-20 mx-auto flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-md bg-purple text-[15.5px] font-semibold text-on-accent shadow-app"
        >
          <ShoppingCart className="size-5" aria-hidden /> {t.verPedido(unidades, precio(subtotal))}
        </Link>
      )}

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

function PedidoEnLinea({ menu, slug }: { menu: MenuPublico; slug: string }) {
  const t = useTextos();
  const navegar = useNavigate();
  const r: Restaurante = menu.restaurante;
  const precio = formatoPrecio(r.moneda);
  const { lineas, cambiarCantidad, quitar, cambiarNota, vaciar } = useCarrito();
  const [tipo, setTipo] = useState<'RECOGER' | 'DOMICILIO'>(
    r.enLinea.recoger ? 'RECOGER' : 'DOMICILIO',
  );
  // Los datos del cliente se recuerdan en este celular para el próximo pedido.
  const [f, setF] = useState(() => ({
    nombre: '',
    telefono: '',
    direccion: '',
    referencia: '',
    ...leer<{ nombre: string; telefono: string; direccion: string; referencia: string }>(
      'enlinea:cliente',
    ),
    nota: '',
    comprobante: '',
  }));
  const [pago, setPago] = useState<'EFECTIVO' | 'SINPE'>('EFECTIVO');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [clientRequestId] = useState(nuevoId); // un id por envío: los reintentos no duplican

  const poner = (k: keyof typeof f, v: string) => {
    setErrores(({ [k]: _, ...resto }) => resto);
    setF((x) => ({ ...x, [k]: v }));
  };
  const envio = tipo === 'DOMICILIO' ? r.enLinea.costoEnvio : 0;
  const t0 = calcularTotales(lineas, { ...r, porcentajeServicio: 0 });
  const totales = { ...t0, total: t0.total + envio };
  const subtotalBruto = lineas.reduce((n, l) => n + l.precioUnitario * l.cantidad, 0);
  const faltaMinimo = r.enLinea.pedidoMinimo > 0 && subtotalBruto < r.enLinea.pedidoMinimo;

  if (lineas.length === 0)
    return (
      <Main>
        <BarraTitulo titulo={t.suPedido} onVolver={() => navegar(`/r/${slug}`)} />
        <p className="px-2.5 py-8 text-center text-muted">{t.carritoVacio}</p>
        <Link
          to={`/r/${slug}`}
          className="flex h-14 w-full items-center justify-center rounded-md bg-purple text-[15.5px] font-semibold text-on-accent md:mx-auto md:w-80"
        >
          {t.verMenu}
        </Link>
      </Main>
    );

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.nombre.trim().length < 2) errs.nombre = t.nombre;
    if (!TELEFONO.test(f.telefono.trim())) errs.telefono = 'Ej.: 8888 8888';
    if (tipo === 'DOMICILIO' && f.direccion.trim().length < 5) errs.direccion = t.direccionEntrega;
    setErrores(errs);
    if (Object.keys(errs).length || faltaMinimo) return;
    setEnviando(true);
    try {
      const { token } = await api.pedirEnLinea(slug, {
        clientRequestId,
        tipo,
        cliente: {
          nombre: f.nombre.trim(),
          telefono: f.telefono.trim(),
          ...(tipo === 'DOMICILIO' && {
            direccion: f.direccion.trim(),
            referencia: f.referencia.trim() || undefined,
          }),
        },
        pago: { metodo: pago, comprobante: f.comprobante.trim() || undefined },
        nota: f.nota.trim() || undefined,
        items: lineas.map((l) => ({
          platoId: l.platoId,
          cantidad: l.cantidad,
          modificadores: l.modificadores,
          notas: l.nota || undefined,
        })),
      });
      guardar('enlinea:cliente', {
        nombre: f.nombre.trim(),
        telefono: f.telefono.trim(),
        direccion: f.direccion.trim(),
        referencia: f.referencia.trim(),
      });
      vaciar();
      navegar(`/seguimiento/${token}`, { replace: true });
    } catch (err) {
      setErrores({ general: (err as Error).message });
      setEnviando(false);
    }
  };

  const campo = (k: keyof typeof f, etiqueta: string, extra: object = {}) => (
    <label className="block text-sm">
      <span className="font-medium">{etiqueta}</span>
      <input
        value={f[k]}
        onChange={(e) => poner(k, e.target.value)}
        aria-invalid={!!errores[k] || undefined}
        className={`mt-1 h-12 w-full rounded-xl border bg-surface px-3 text-fg ${errores[k] ? 'border-danger' : 'border-line'}`}
        {...extra}
      />
      {errores[k] && <span className="mt-1 block text-xs text-danger">{errores[k]}</span>}
    </label>
  );
  const opcion = (activo: boolean) =>
    `flex min-h-14 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${activo ? 'bg-purple text-on-accent' : 'bg-surface text-fg'}`;

  return (
    <Main>
      {enviando && (
        <div className="anim-aparecer fixed inset-0 z-50">
          <Cargando />
        </div>
      )}
      <BarraTitulo titulo={t.suPedido} onVolver={() => navegar(`/r/${slug}`)} />
      <form
        onSubmit={enviar}
        noValidate
        className="flex flex-col gap-[22px] md:grid md:grid-cols-[minmax(0,1fr)_360px] md:items-start md:gap-8"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {lineas.map((l) => (
              <CartItem
                key={l.clave}
                linea={l}
                agotado={false}
                precio={precio}
                onCantidad={(n) => cambiarCantidad(l.clave, n)}
                onQuitar={() => quitar(l.clave)}
                onNota={(nota) => cambiarNota(l.clave, nota)}
              />
            ))}
          </div>

          <fieldset className="flex gap-2">
            <legend className="sr-only">{t.suPedido}</legend>
            {r.enLinea.recoger && (
              <button
                type="button"
                aria-pressed={tipo === 'RECOGER'}
                onClick={() => setTipo('RECOGER')}
                className={opcion(tipo === 'RECOGER')}
              >
                <Store className="size-5" aria-hidden /> {t.paraRecoger}
              </button>
            )}
            {r.enLinea.domicilio && (
              <button
                type="button"
                aria-pressed={tipo === 'DOMICILIO'}
                onClick={() => setTipo('DOMICILIO')}
                className={opcion(tipo === 'DOMICILIO')}
              >
                <Bike className="size-5" aria-hidden /> {t.aDomicilio}
              </button>
            )}
          </fieldset>
          {tipo === 'DOMICILIO' && r.enLinea.zonaEntrega && (
            <p className="text-sm text-muted">{t.zonaEntrega(r.enLinea.zonaEntrega)}</p>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t.susDatos}</h2>
            {campo('nombre', t.nombre, { autoComplete: 'name' })}
            {campo('telefono', t.telefono, {
              type: 'tel',
              autoComplete: 'tel',
              placeholder: '8888 8888',
            })}
            {tipo === 'DOMICILIO' && (
              <>
                {campo('direccion', t.direccionEntrega, { autoComplete: 'street-address' })}
                {campo('referencia', t.referencia, { placeholder: t.referenciaEjemplo })}
              </>
            )}
            {campo('nota', t.notaPedido, { maxLength: 200 })}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t.formaPago}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={pago === 'EFECTIVO'}
                onClick={() => setPago('EFECTIVO')}
                className={opcion(pago === 'EFECTIVO')}
              >
                {t.efectivo}
              </button>
              {r.enLinea.sinpeNumero && (
                <button
                  type="button"
                  aria-pressed={pago === 'SINPE'}
                  onClick={() => setPago('SINPE')}
                  className={opcion(pago === 'SINPE')}
                >
                  {t.sinpe}
                </button>
              )}
            </div>
            {pago === 'SINPE' && r.enLinea.sinpeNumero && (
              <>
                <p className="rounded-md bg-amber-soft p-3 text-sm text-amber-ink">
                  {t.sinpeInstrucciones(
                    precio(totales.total),
                    r.enLinea.sinpeNumero,
                    r.enLinea.sinpeNombre ?? '',
                  )}{' '}
                  {t.sinpePlazo(r.enLinea.minutosPagoSinpe)}
                </p>
                {campo('comprobante', t.comprobante, { inputMode: 'numeric', maxLength: 40 })}
              </>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-[22px] md:sticky md:top-6">
          <TotalsSummary
            totales={totales}
            config={{ ...r, porcentajeServicio: 0 }}
            precio={precio}
            etiquetaTotal={t.total}
            envio={envio}
          />
          {faltaMinimo && (
            <p className="rounded-md bg-amber-soft px-4 py-3 text-[13px] text-amber-ink">
              {t.pedidoMinimo(precio(r.enLinea.pedidoMinimo))}
            </p>
          )}
          {(errores.general || !r.abierto) && (
            <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-[13px] text-danger">
              {errores.general ?? t.cerradoBanner}
            </p>
          )}
          <button
            type="submit"
            disabled={enviando || faltaMinimo || !r.abierto}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-md bg-purple text-[15.5px] font-semibold text-on-accent disabled:opacity-60"
          >
            <ShoppingBag className="size-5" aria-hidden /> {t.hacerPedido(precio(totales.total))}
          </button>
        </div>
      </form>
    </Main>
  );
}
