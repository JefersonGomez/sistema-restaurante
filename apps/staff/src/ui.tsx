import {
  BarChart3,
  ChevronDown,
  Bell,
  Bike,
  BellRing,
  Check,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  Contact,
  Globe,
  House,
  LogOut,
  Palette,
  QrCode,
  ReceiptText,
  Settings,
  TabletSmartphone,
  Users,
  Utensils,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { activarSonido, elegirSonido, SONIDOS, tipoSonido, type TipoSonido } from './alertas';
import {
  borrarAvisos,
  marcarLeidos,
  notificacionesActivas,
  notificacionesDisponibles,
  pedirPermisoNotificaciones,
  useAvisos,
  type TipoAviso,
} from './avisos';
import { Link, NavLink } from 'react-router-dom';
import type { Moneda } from '@menu-qr/shared';
import { useAuth } from './auth';

export const formatoPrecio = (moneda: Moneda) => {
  const f = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: moneda === 'CRC' ? 0 : 2,
  });
  return (centimos: number) => f.format(centimos / 100);
};

// Google Maps y Waze al punto que marcó el cliente o, si no marcó, a la dirección escrita.
export function enlacesMapa(d: {
  ubicacion: { lat: number; lng: number } | null;
  direccion: string | null;
}) {
  const punto = d.ubicacion && `${d.ubicacion.lat},${d.ubicacion.lng}`;
  const q = encodeURIComponent(punto ?? d.direccion ?? '');
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: punto
      ? `https://waze.com/ul?ll=${q}&navigate=yes`
      : `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });

export function Conexion({ conectado }: { conectado: boolean }) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        conectado ? 'bg-ok-soft text-ok' : 'animate-pulse bg-danger-soft text-danger'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${conectado ? 'bg-ok' : 'bg-danger'}`} />
      <span className="max-sm:sr-only">{conectado ? 'Conectado' : 'Reconectando…'}</span>
    </span>
  );
}

// Color con significado de cada sección (spec Fase 6): el mismo en la barra lateral y en las pestañas.
// Morado = marca, ámbar = menú, verde = servicio, rojo = cocina, azul = información, gris = ajustes.
const TONOS = {
  marca: 'bg-purple-soft text-purple',
  ambar: 'bg-amber-soft text-amber-ink',
  verde: 'bg-ok-soft text-ok',
  rojo: 'bg-danger-soft text-danger',
  azul: 'bg-info-soft text-info',
  gris: 'bg-surface-2 text-muted',
};
export const SECCIONES: Record<string, { Icono: LucideIcon; tono: keyof typeof TONOS }> = {
  '/panel': { Icono: House, tono: 'marca' },
  '/panel/menu': { Icono: UtensilsCrossed, tono: 'ambar' },
  '/panel/personalizar': { Icono: Palette, tono: 'marca' },
  '/panel/mesas': { Icono: QrCode, tono: 'verde' },
  '/panel/clientes': { Icono: Contact, tono: 'marca' },
  '/panel/personal': { Icono: Users, tono: 'azul' },
  '/panel/dispositivos': { Icono: TabletSmartphone, tono: 'azul' },
  '/panel/reportes': { Icono: BarChart3, tono: 'azul' },
  '/panel/ajustes': { Icono: Settings, tono: 'gris' },
  '/cocina': { Icono: ChefHat, tono: 'rojo' },
  '/mesero': { Icono: ConciergeBell, tono: 'verde' },
  '/caja': { Icono: ReceiptText, tono: 'verde' },
  '/en-linea': { Icono: Globe, tono: 'azul' },
};

export function IconoSeccion({ ruta, chico }: { ruta: string; chico?: boolean }) {
  const { Icono, tono } = SECCIONES[ruta]!;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center ${chico ? 'size-6 rounded-md' : 'size-8 rounded-lg'} ${TONOS[tono]}`}
    >
      <Icono className={chico ? 'size-3.5' : 'size-[18px]'} />
    </span>
  );
}

// Secciones del plan Completo: con el plan Básico no se muestran.
export const SOLO_COMPLETO = new Set(['/en-linea', '/panel/clientes']);
export const verSeccion = (plan: string | undefined, ruta: string) =>
  plan !== 'BASICO' || !SOLO_COMPLETO.has(ruta);

// Pestañas del encabezado según el rol (el mesero y la caja también atienden los pedidos en línea).
const PANTALLAS: Partial<Record<string, { ruta: string; texto: string }[]>> = {
  DUENO: [
    { ruta: '/panel', texto: 'Panel' },
    { ruta: '/cocina', texto: 'Cocina/Bar' },
    { ruta: '/mesero', texto: 'Mesero' },
    { ruta: '/caja', texto: 'Caja' },
    { ruta: '/en-linea', texto: 'En línea' },
  ],
  MESERO: [
    { ruta: '/mesero', texto: 'Mesas' },
    { ruta: '/en-linea', texto: 'En línea' },
  ],
  CAJA: [
    { ruta: '/caja', texto: 'Caja' },
    { ruta: '/en-linea', texto: 'En línea' },
  ],
};

// Encabezado de las pantallas de operación: título, negocio, acciones y pestañas por rol (la
// activa es un bloque claro). `debajo` va pegado bajo las pestañas (p. ej. "Pendiente ahora").
export function Encabezado({
  titulo,
  children,
  debajo,
}: {
  titulo: string;
  children?: ReactNode;
  debajo?: ReactNode;
}) {
  const { usuario, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg print:hidden">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 pt-3 pb-2.5">
        <div className="mr-auto min-w-40">
          <h1 className="font-display text-2xl leading-none font-extrabold tracking-[-0.02em]">
            {titulo}
          </h1>
          <p className="mt-1.5 truncate text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
            {usuario?.nombre}
            {usuario?.restaurante ? ` · ${usuario.restaurante.nombre}` : ''}
          </p>
        </div>
        {children}
        <Campana />
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-fg"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="max-sm:sr-only">Salir</span>
        </button>
      </div>
      {usuario && PANTALLAS[usuario.rol] && (
        <nav aria-label="Pantallas" className="flex gap-1.5 overflow-x-auto px-3 pb-2.5">
          {PANTALLAS[usuario.rol]!.filter((p) => verSeccion(usuario.restaurante?.plan, p.ruta)).map(
            (p) => {
              const { Icono } = SECCIONES[p.ruta]!;
              return (
                <NavLink
                  key={p.ruta}
                  to={p.ruta}
                  className={({ isActive }) =>
                    `flex h-10 shrink-0 items-center gap-2 rounded-[10px] px-3.5 font-display text-base ${
                      isActive
                        ? 'bg-fg font-extrabold text-bg'
                        : 'font-semibold text-muted hover:bg-surface hover:text-fg'
                    }`
                  }
                >
                  <Icono className="size-[18px]" aria-hidden />
                  {p.texto}
                </NavLink>
              );
            },
          )}
        </nav>
      )}
      {debajo}
    </header>
  );
}

// Indicador de la barra superior de operación ("3 nuevos"); en rojo sólido si `alerta`.
export function Kpi({
  texto,
  valor,
  alerta,
}: {
  texto: string;
  valor: string | number;
  alerta?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm ${alerta ? 'bg-danger text-bg' : 'bg-app text-muted'}`}
    >
      <span
        className={`font-display text-lg font-extrabold tabular-nums ${alerta ? '' : 'text-fg'}`}
      >
        {valor}
      </span>
      {texto}
    </span>
  );
}

// Selector segmentado (Todas / Cocina / Bar…), cada opción con su contador.
export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: { id: T; texto: string; cantidad?: number }[];
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex h-10 rounded-[10px] bg-app p-1">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={valor === o.id}
          onClick={() => onCambio(o.id)}
          className={`flex items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
            valor === o.id ? 'bg-fg text-bg' : 'text-muted hover:text-fg'
          }`}
        >
          {o.texto}
          {o.cantidad !== undefined && (
            <span className="tabular-nums opacity-80">{o.cantidad}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Columna del tablero de operación: encabezado fijo y cuerpo con scroll propio (en pantallas
// anchas; en angostas las columnas se apilan).
export function ColumnaTablero({
  titulo,
  punto,
  cantidad,
  pista,
  className,
  children,
}: {
  titulo: string;
  punto: string;
  cantidad: number;
  pista: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className={`flex min-w-0 flex-col rounded-2xl border border-line bg-bg lg:min-h-0 ${className}`}
    >
      <div className="px-2 py-2.5">
        <TituloColumna titulo={titulo} punto={punto} cantidad={cantidad} pista={pista} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}

// Color de la píldora de tiempo según cuánto del límite se gastó: verde, ámbar (60%), rojo (100%).
export const tonoTiempo = (proporcion: number) =>
  proporcion >= 1
    ? 'bg-danger text-bg'
    : proporcion >= 0.6
      ? 'bg-amber-soft text-amber'
      : 'bg-ok-soft text-ok';

// Encabezado de columna de las pantallas de operación: punto de color, título, contador y pista.
export function TituloColumna({
  titulo,
  punto,
  cantidad,
  pista,
}: {
  titulo: string;
  punto: string; // clase de fondo del punto (bg-info, bg-amber, bg-ok…)
  cantidad?: number;
  pista?: string;
}) {
  return (
    <h2 className="flex items-center gap-2 px-1">
      <span className={`size-2.5 rounded-full ${punto}`} aria-hidden />
      <span className="font-display text-base font-extrabold tracking-wide uppercase">
        {titulo}
      </span>
      {cantidad !== undefined && (
        <span className="rounded-full bg-surface-2 px-2 text-sm font-bold tabular-nums">
          {cantidad}
        </span>
      )}
      {pista && <span className="ml-auto text-xs text-muted">{pista}</span>}
    </h2>
  );
}

// Sonido del equipo (Fase 20.2): un botón pequeño con el sonido elegido (suave, campana o sin
// sonido) y, si falta, el permiso de notificaciones. El audio se activa solo con el primer toque.
export function BotonSonido() {
  const [tipo, setTipo] = useState<TipoSonido>(tipoSonido);
  const [, refrescar] = useState(0);
  const faltaPermiso = notificacionesDisponibles() && Notification.permission === 'default';
  const Icono = tipo === 'apagado' ? VolumeX : Volume2;
  return (
    <details className="relative">
      <summary
        className="relative grid size-10 cursor-pointer list-none place-items-center rounded-md hover:bg-surface"
        aria-label={`Sonido: ${SONIDOS.find((s) => s.id === tipo)!.texto}`}
        onClick={() => activarSonido(false)}
      >
        <Icono className="size-5" aria-hidden />
        {faltaPermiso && (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber" aria-hidden />
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-line bg-app p-1.5 shadow-app">
        <p className="px-3 pt-1.5 pb-1 text-xs font-semibold text-muted">Sonido de los avisos</p>
        {SONIDOS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={tipo === s.id}
            onClick={() => {
              elegirSonido(s.id);
              setTipo(s.id);
            }}
            className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-sm hover:bg-surface-2"
          >
            {s.texto}
            {tipo === s.id && <Check className="size-4 text-ok" aria-hidden />}
          </button>
        ))}
        {faltaPermiso && (
          <button
            type="button"
            onClick={async () => {
              await pedirPermisoNotificaciones();
              refrescar((n) => n + 1);
            }}
            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-md border-t border-line px-3 text-left text-sm hover:bg-surface-2"
          >
            <BellRing className="size-4 shrink-0" aria-hidden />
            Avisar también con la pantalla apagada
          </button>
        )}
      </div>
    </details>
  );
}

const ICONO_AVISO: Record<TipoAviso, typeof Bell> = {
  llamada: Bell,
  cuenta: ReceiptText,
  pedido: ClipboardList,
  cocina: ChefHat,
  listo: Utensils,
  reparto: Bike,
};
const haceCuanto = (t: number) => {
  const min = Math.floor((Date.now() - t) / 60_000);
  return min < 1 ? 'Ahora' : min < 60 ? `Hace ${min} min` : hora(new Date(t).toISOString());
};

// Campanita con los avisos (llamadas, cuentas, pedidos, cocina demorada, platos esperando).
// Siempre en el encabezado; los avisos se conservan al cambiar de pantalla.
export function Campana() {
  const avisos = useAvisos();
  const [abierta, setAbierta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const sinLeer = avisos.filter((a) => !a.leido).length;
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) =>
      !caja.current?.contains(e.target as Node) && setAbierta(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false);
    window.addEventListener('pointerdown', fuera);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', fuera);
      window.removeEventListener('keydown', esc);
    };
  }, [abierta]);
  const Icono = sinLeer ? BellRing : Bell;
  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-expanded={abierta}
        aria-label={sinLeer ? `Avisos: ${sinLeer} sin leer` : 'Avisos'}
        onClick={() => {
          setAbierta((v) => !v);
          if (abierta) marcarLeidos();
        }}
        className="relative grid size-11 place-items-center rounded-md hover:bg-surface"
      >
        <Icono
          className={`size-5 ${sinLeer ? 'campana-sonando text-amber' : 'text-muted'}`}
          aria-hidden
        />
        {sinLeer > 0 && (
          <span className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-accent">
            {sinLeer}
          </span>
        )}
      </button>
      {abierta && (
        <div
          role="dialog"
          aria-label="Avisos"
          className="anim-aparecer z-40 overflow-hidden max-sm:fixed max-sm:inset-x-3 max-sm:top-16 sm:absolute sm:right-0 sm:mt-2 sm:w-[22rem] overflow-hidden rounded-lg border border-line bg-app shadow-app"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="font-semibold">Avisos</p>
            {avisos.length > 0 && (
              <button
                type="button"
                onClick={borrarAvisos}
                className="min-h-11 px-2 text-sm text-muted hover:text-fg"
              >
                Borrar todo
              </button>
            )}
          </div>
          {avisos.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">Sin avisos por ahora.</p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {avisos.map((a) => {
                const I = ICONO_AVISO[a.tipo];
                return (
                  <li
                    key={a.id}
                    className={`flex gap-3 px-4 py-3 ${a.leido ? '' : 'bg-amber-soft/60'}`}
                  >
                    <I className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{a.texto}</span>
                      <span className="text-xs text-muted">{haceCuanto(a.fecha)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {notificacionesDisponibles() && !notificacionesActivas() && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              Para recibir avisos con la pantalla en otra pestaña, toque «Activar sonido y avisos» y
              permita las notificaciones.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Menú "Más" del encabezado: cada opción abre su propia pantalla. El contador avisa sin abrirlo.
export function MenuMas({
  opciones,
}: {
  opciones: { a: string; texto: string; detalle?: string; contador?: number; alerta?: boolean }[];
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);
  const total = opciones.reduce((n, o) => n + (o.contador ?? 0), 0);
  const alerta = opciones.some((o) => o.alerta && o.contador);
  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-expanded={abierto}
        aria-haspopup="menu"
        onClick={() => setAbierto(!abierto)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
      >
        Más
        {total > 0 && (
          <span
            className={`rounded-full px-1.5 text-xs font-bold ${alerta ? 'bg-danger text-on-accent' : 'bg-info text-on-accent'}`}
          >
            {total}
          </span>
        )}
        <ChevronDown
          className={`size-4 transition-transform ${abierto ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {abierto && (
        <div
          role="menu"
          className="anim-entrar absolute right-0 z-30 mt-2 w-72 rounded-lg border border-line bg-app p-1 shadow-app"
        >
          {opciones.map((o) => (
            <Link
              key={o.a}
              to={o.a}
              role="menuitem"
              onClick={() => setAbierto(false)}
              className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 hover:bg-surface"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{o.texto}</span>
                {o.detalle && <span className="block text-xs text-muted">{o.detalle}</span>}
              </span>
              {!!o.contador && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.alerta ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info'}`}
                >
                  {o.contador}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Vuelve a la caja desde sus pantallas aparte.
export function VolverACaja() {
  return (
    <Link
      to="/caja"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-surface px-3 text-sm font-semibold hover:bg-surface-2"
    >
      ← Volver a caja
    </Link>
  );
}
