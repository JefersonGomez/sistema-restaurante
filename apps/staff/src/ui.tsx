import {
  Bell,
  BellRing,
  ChefHat,
  ClipboardList,
  LogOut,
  ReceiptText,
  Utensils,
  Volume2,
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

const PANTALLAS_DUENO = [
  { ruta: '/panel', texto: 'Panel' },
  { ruta: '/cocina', texto: 'Cocina/Bar' },
  { ruta: '/mesero', texto: 'Mesero' },
  { ruta: '/caja', texto: 'Caja' },
];

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
      {usuario?.rol === 'DUENO' && (
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-2 text-sm">
          {PANTALLAS_DUENO.map((p) => (
            <NavLink
              key={p.ruta}
              to={p.ruta}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center px-3 ${isActive ? 'border-b-2 border-purple font-semibold text-purple' : 'text-muted'}`
              }
            >
              {p.texto}
            </NavLink>
          ))}
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
export function pedirMotivo(pregunta: string) {
  const m = prompt(pregunta)?.trim();
  return m ? m.slice(0, 200) : null;
}
