import {
  BarChart3,
  Bell,
  Bike,
  BellRing,
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
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { activarSonido, sonidoActivo } from './alertas';
import {
  borrarAvisos,
  marcarLeidos,
  notificacionesActivas,
  notificacionesDisponibles,
  pedirPermisoNotificaciones,
  useAvisos,
  type TipoAviso,
} from './avisos';
import { NavLink } from 'react-router-dom';
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

export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const { usuario, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-app print:hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="min-w-36 flex-1">
          <h1 className="truncate text-[17px] font-semibold">{titulo}</h1>
          <p className="truncate text-xs text-muted">
            {usuario?.nombre}
            {usuario?.restaurante ? ` · ${usuario.restaurante.nombre}` : ''}
          </p>
        </div>
        {children}
        <Campana />
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted hover:bg-surface"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="max-sm:sr-only">Salir</span>
        </button>
      </div>
      {usuario && PANTALLAS[usuario.rol] && (
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 text-sm">
          {PANTALLAS[usuario.rol]!.filter((p) => verSeccion(usuario.restaurante?.plan, p.ruta)).map(
            (p) => (
              <NavLink
                key={p.ruta}
                to={p.ruta}
                className={({ isActive }) =>
                  `flex min-h-11 shrink-0 items-center gap-2 px-3 ${isActive ? 'border-b-2 border-purple font-semibold text-fg' : 'text-muted'}`
                }
              >
                <IconoSeccion ruta={p.ruta} chico />
                {p.texto}
              </NavLink>
            ),
          )}
        </nav>
      )}
    </header>
  );
}

// Aparece mientras el audio esté bloqueado o falte el permiso de notificaciones. Un toque activa
// las dos cosas (el navegador exige un toque para ambas).
export function BotonSonido() {
  const [, refrescar] = useState(0);
  useEffect(() => {
    // El primer toque en cualquier parte también activa el audio (alertas.ts): se revisa de nuevo.
    const revisar = () => setTimeout(() => refrescar((n) => n + 1), 300);
    window.addEventListener('pointerdown', revisar);
    return () => window.removeEventListener('pointerdown', revisar);
  }, []);
  const faltaPermiso = notificacionesDisponibles() && Notification.permission === 'default';
  if (sonidoActivo() && !faltaPermiso) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        activarSonido();
        await pedirPermisoNotificaciones();
        refrescar((n) => n + 1);
      }}
      className="inline-flex min-h-11 animate-pulse items-center gap-1.5 rounded-md bg-amber px-3 text-sm font-semibold text-on-amber"
    >
      <Volume2 className="size-4" aria-hidden />
      <span className="max-sm:sr-only">Activar sonido y avisos</span>
    </button>
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

// Pide un texto (motivo de cancelación). null si se canceló el diálogo.
export function pedirMotivo(pregunta: string, sugerido?: string) {
  const m = prompt(pregunta, sugerido)?.trim();
  return m ? m.slice(0, 200) : null;
}
