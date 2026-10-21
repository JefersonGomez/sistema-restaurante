import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import type {
  CrearPedidoInput,
  CuentaDetalle,
  Idioma,
  MenuPublico,
  MesaPublica,
  PlatoPublico,
} from '@menu-qr/shared';
import * as api from './api';
import { guardar, leer, nuevoId } from './almacen';
import { Carrito } from './Carrito';
import { FichaPlato, type LineaCarrito } from './FichaPlato';
import { nombre, TEXTOS } from './i18n';
import { MiCuenta } from './MiCuenta';

type Envio = { clientRequestId: string; pedido: CrearPedidoInput };

const claves = (tokenQr: string, cuentaId?: string) => ({
  sesion: `sesion:${tokenQr}`,
  carrito: `carrito:${cuentaId}`,
  envio: `envio:${cuentaId}`,
});

function idiomaInicial(): Idioma {
  const guardado = leer<Idioma>('menu-idioma');
  if (guardado === 'es' || guardado === 'en') return guardado;
  return navigator.language.startsWith('en') ? 'en' : 'es';
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MenuPage() {
  const { token: tokenQr = '' } = useParams();
  const [fase, setFase] = useState<'cargando' | 'listo' | 'noEncontrado' | 'error' | 'cerrada'>(
    'cargando',
  );
  const [mesa, setMesa] = useState<MesaPublica>();
  const [menu, setMenu] = useState<MenuPublico>();
  const [cuenta, setCuenta] = useState<CuentaDetalle>();
  const [vista, setVista] = useState<'menu' | 'cuenta'>('menu');
  const [ficha, setFicha] = useState<PlatoPublico | null>(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [lineas, setLineas] = useState<LineaCarrito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conectado, setConectado] = useState(true);
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaInicial);
  const secuencia = useRef(0);

  const idiomas = menu?.restaurante.idiomas ?? ['es', 'en'];
  const lang: Idioma = idiomas.includes(idioma) ? idioma : (idiomas[0] ?? 'es');
  const t = TEXTOS[lang];

  const terminar = useCallback(() => {
    const k = claves(tokenQr, mesa?.cuentaId);
    guardar(k.sesion, null);
    guardar(k.carrito, null);
    guardar(k.envio, null);
    setFase('cerrada');
  }, [tokenQr, mesa?.cuentaId]);

  // Abre (o recupera) la sesión de esta mesa y carga menú y cuenta.
  const abrir = useCallback(
    async (reutilizar: boolean) => {
      const k = claves(tokenQr);
      const m = await api.abrirMesa(tokenQr, reutilizar ? leer<string>(k.sesion) : null);
      guardar(k.sesion, m.token);
      setMesa(m);
      setLineas(leer<LineaCarrito[]>(claves(tokenQr, m.cuentaId).carrito) ?? []);
      const [datosMenu, datosCuenta] = await Promise.all([
        api.obtenerMenu(m.slug),
        api.verCuenta(m.token),
      ]);
      setMenu(datosMenu);
      setCuenta(datosCuenta);
      document.title = datosMenu.restaurante.nombre;
      setFase('listo');
      return m;
    },
    [tokenQr],
  );

  useEffect(() => {
    abrir(true).catch((e: api.ErrorApi) => setFase(e.status === 404 ? 'noEncontrado' : 'error'));
  }, [abrir]);

  // Siempre se vuelve a pedir el estado por REST; se ignoran respuestas de pedidos más viejos.
  const refrescarCuenta = useCallback(async () => {
    if (!mesa) return;
    const n = ++secuencia.current;
    try {
      const c = await api.verCuenta(mesa.token);
      if (n === secuencia.current) setCuenta(c);
    } catch (e) {
      const err = e as api.ErrorApi;
      if (err.status === 410) terminar();
      else if (err.status === 401) abrir(false).catch(() => {});
    }
  }, [mesa, terminar, abrir]);

  const refrescarMenu = useCallback(async () => {
    if (mesa) setMenu(await api.obtenerMenu(mesa.slug).catch(() => menu));
  }, [mesa, menu]);

  // Tiempo real: el socket solo avisa; al reconectar se resincroniza todo.
  const refrescos = useRef({ cuenta: refrescarCuenta, menu: refrescarMenu, terminar });
  refrescos.current = { cuenta: refrescarCuenta, menu: refrescarMenu, terminar };
  useEffect(() => {
    if (!mesa) return;
    const socket = io(api.API, { auth: { sesion: mesa.token } });
    let espera: ReturnType<typeof setTimeout>;
    const cuentaCambio = () => {
      clearTimeout(espera);
      espera = setTimeout(() => refrescos.current.cuenta(), 150);
    };
    socket.on('connect', () => {
      setConectado(true);
      refrescos.current.cuenta();
      refrescos.current.menu();
    });
    socket.on('disconnect', () => setConectado(false));
    socket.on('connect_error', (e) => {
      setConectado(false);
      if (e.message === 'CUENTA_CERRADA') refrescos.current.terminar();
    });
    for (const ev of [
      'pedido:nuevo',
      'pedido:confirmado',
      'pedido:cancelado',
      'item:estado',
      'cuenta:actualizada',
    ])
      socket.on(ev, cuentaCambio);
    socket.on('menu:actualizado', () => refrescos.current.menu());
    socket.on('cuenta:cerrada', () => refrescos.current.terminar());
    return () => {
      clearTimeout(espera);
      socket.disconnect();
    };
  }, [mesa]);

  const actualizarLineas = (nuevas: LineaCarrito[]) => {
    setLineas(nuevas);
    guardar(claves(tokenQr, mesa?.cuentaId).carrito, nuevas);
  };

  // Envío seguro: el clientRequestId se guarda antes de enviar y se reutiliza en cada reintento
  // (incluso tras recargar la página), así el servidor nunca duplica el pedido.
  const enviar = useCallback(async () => {
    if (!mesa || enviando) return;
    const k = claves(tokenQr, mesa.cuentaId);
    let envio = leer<Envio>(k.envio);
    if (!envio) {
      if (lineas.length === 0) return;
      const clientRequestId = nuevoId();
      envio = {
        clientRequestId,
        pedido: {
          clientRequestId,
          items: lineas.map((l) => ({
            platoId: l.platoId,
            cantidad: l.cantidad,
            notas: l.notas || undefined,
            modificadores: l.modificadores,
          })),
        },
      };
      guardar(k.envio, envio);
    }
    setEnviando(true);
    setErrorEnvio(null);
    try {
      for (let intento = 0; ; intento++) {
        try {
          await api.enviarPedido(mesa.token, envio.pedido);
          guardar(k.envio, null);
          actualizarLineas([]);
          setCarritoAbierto(false);
          setVista('cuenta');
          await refrescarCuenta();
          return;
        } catch (e) {
          const err = e as api.ErrorApi;
          const reintentable = err.status === 0 || err.status >= 500 || err.status === 429;
          if (reintentable && intento < 3) {
            await esperar(1000 * 2 ** intento);
            continue;
          }
          if (reintentable) return setErrorEnvio(t.sinRed); // queda guardado para reintentar
          guardar(k.envio, null); // rechazado: el próximo intento lleva otro id
          if (err.status === 410) return terminar();
          if (err.code === 'PLATO_NO_DISPONIBLE') refrescarMenu();
          return setErrorEnvio(`${t.errorPedido}: ${err.message}`);
        }
      }
    } finally {
      setEnviando(false);
    }
  }, [mesa, enviando, lineas, tokenQr, t, refrescarCuenta, refrescarMenu, terminar]);

  // Si quedó un envío a medias (se cayó la red o se recargó la página), se reintenta solo.
  const reintentoInicial = useRef(false);
  useEffect(() => {
    if (fase === 'listo' && mesa && !reintentoInicial.current) {
      reintentoInicial.current = true;
      if (leer(claves(tokenQr, mesa.cuentaId).envio)) enviar();
    }
  }, [fase, mesa, tokenQr, enviar]);

  const avisar = (texto: string) => {
    setAviso(texto);
    setTimeout(() => setAviso(null), 4000);
  };

  const llamar = async () => {
    if (!mesa || !confirm(t.confirmarLlamar)) return;
    await api.llamarMesero(mesa.token).then(
      () => avisar(t.meseroAvisado),
      (e: api.ErrorApi) => avisar(e.message),
    );
  };

  const pedirCuenta = async () => {
    if (!mesa || !confirm(t.confirmarCuenta)) return;
    try {
      await api.pedirCuenta(mesa.token);
      avisar(t.cuentaPedida);
      refrescarCuenta();
    } catch (e) {
      const err = e as api.ErrorApi;
      if (err.status === 410) terminar();
      else avisar(err.status === 409 ? t.cuentaYaPedida : err.message);
    }
  };

  const setIdioma = (i: Idioma) => {
    setIdiomaState(i);
    guardar('menu-idioma', i);
  };

  if (fase === 'cerrada')
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-4xl" aria-hidden>
            🙌
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-stone-800">{t.gracias}</h1>
          <p className="mt-2 text-stone-600">{t.graciasDetalle}</p>
        </div>
      </main>
    );
  if (fase === 'noEncontrado' || fase === 'error')
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center text-stone-600">
        <div>
          <p>{fase === 'noEncontrado' ? t.noEncontrado : t.error}</p>
          {fase === 'error' && (
            <button
              type="button"
              onClick={() => location.reload()}
              className="mt-4 rounded-full border px-4 py-2"
            >
              {t.reintentar}
            </button>
          )}
        </div>
      </main>
    );
  if (fase === 'cargando' || !menu || !mesa || !cuenta)
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
  const enCarrito = lineas.reduce((s, l) => s + l.cantidad, 0);
  const totalCarrito = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);

  return (
    <div
      className="mx-auto min-h-dvh max-w-xl bg-white pb-36 text-stone-800 shadow-sm"
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
              {!conectado && <span className="ml-2 text-amber-700">· {t.reconectando}</span>}
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
                  className={`rounded-full px-3 py-1 font-medium uppercase ${lang === i ? 'bg-[var(--color-marca)] text-white' : 'text-stone-600'}`}
                >
                  {i}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex border-t border-stone-100 text-sm" role="tablist">
          {(['menu', 'cuenta'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`flex-1 py-2.5 font-medium ${vista === v ? 'border-b-2 border-[var(--color-marca)] text-[var(--color-marca)]' : 'text-stone-500'}`}
            >
              {v === 'menu' ? t.menu : t.miCuenta}
              {v === 'cuenta' && cuenta.pedidos.some((p) => p.estado === 'PENDIENTE') && ' ⏳'}
            </button>
          ))}
        </div>
        {vista === 'menu' && (
          <nav className="flex gap-2 overflow-x-auto px-4 py-2 text-sm" aria-label="Categorías">
            {menu.categorias.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-stone-700"
              >
                {nombre(c, lang)}
              </a>
            ))}
          </nav>
        )}
      </header>

      {vista === 'menu' ? (
        <main className="px-4">
          {menu.categorias.map((c) => (
            <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-36 pt-6">
              <h2 className="mb-2 text-base font-semibold tracking-wide text-[var(--color-marca)] uppercase">
                {nombre(c, lang)}
              </h2>
              <ul className="divide-y divide-stone-100">
                {c.platos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={p.agotado}
                      onClick={() => setFicha(p)}
                      className="flex w-full gap-3 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-medium">{nombre(p, lang)}</h3>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {precio(p.precio)}
                          </span>
                        </div>
                        {(lang === 'en' ? p.descripcionEn : p.descripcionEs) && (
                          <p className="mt-1 line-clamp-2 text-sm text-stone-600">
                            {lang === 'en' ? p.descripcionEn : p.descripcionEs}
                          </p>
                        )}
                        {p.agotado && (
                          <span className="mt-2 inline-block rounded bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">
                            {t.agotado}
                          </span>
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
                    </button>
                  </li>
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
      ) : (
        <MiCuenta
          cuenta={cuenta}
          lang={lang}
          precio={precio}
          porcentajes={{ iva: r.porcentajeIva, servicio: r.porcentajeServicio }}
        />
      )}

      {aviso && (
        <p
          role="status"
          className="fixed inset-x-4 top-4 z-40 mx-auto max-w-md rounded-lg bg-stone-900 p-3 text-center text-sm text-white"
        >
          {aviso}
        </p>
      )}

      {/* Barra inferior: llamar, pedir cuenta y carrito */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl space-y-2 bg-gradient-to-t from-white via-white to-white/0 p-3 pt-6">
        {errorEnvio && !carritoAbierto && (
          <button
            type="button"
            onClick={enviar}
            className="w-full rounded-lg bg-red-50 p-2 text-sm text-red-800"
          >
            {errorEnvio}
          </button>
        )}
        {enCarrito > 0 && (
          <button
            type="button"
            onClick={() => setCarritoAbierto(true)}
            className="h-12 w-full rounded-full bg-[var(--color-marca)] font-semibold text-white shadow-lg"
          >
            {t.verCarrito(enCarrito, precio(totalCarrito))}
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={llamar}
            className="h-11 flex-1 rounded-full border border-stone-300 bg-white text-sm font-medium shadow-sm"
          >
            🙋 {t.llamarMesero}
          </button>
          <button
            type="button"
            onClick={pedirCuenta}
            disabled={cuenta.estado === 'PIDIO_CUENTA' || cuenta.pedidos.length === 0}
            className="h-11 flex-1 rounded-full border border-stone-300 bg-white text-sm font-medium shadow-sm disabled:opacity-50"
          >
            🧾 {cuenta.estado === 'PIDIO_CUENTA' ? t.cuentaYaPedida : t.pedirCuenta}
          </button>
        </div>
      </div>

      {ficha && (
        <FichaPlato
          plato={ficha}
          lang={lang}
          precio={precio}
          onCerrar={() => setFicha(null)}
          onAgregar={(l) => {
            actualizarLineas([...lineas, { ...l, id: nuevoId() }]);
            setFicha(null);
          }}
        />
      )}
      {carritoAbierto && (
        <Carrito
          lineas={lineas}
          lang={lang}
          config={r}
          precio={precio}
          enviando={enviando}
          error={errorEnvio}
          onCantidad={(id, n) =>
            actualizarLineas(
              n < 1
                ? lineas.filter((l) => l.id !== id)
                : lineas.map((l) => (l.id === id ? { ...l, cantidad: n } : l)),
            )
          }
          onEnviar={enviar}
          onCerrar={() => setCarritoAbierto(false)}
        />
      )}
    </div>
  );
}
