import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
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

export function BotonSonido({ activo, onActivar }: { activo: boolean; onActivar: () => void }) {
  if (activo) return null;
  return (
    <button
      type="button"
      onClick={onActivar}
      className="min-h-11 animate-pulse rounded-md bg-amber px-3 text-sm font-semibold text-on-amber"
    >
      🔔 <span className="max-sm:sr-only">Activar sonido</span>
    </button>
  );
}

// Pide un texto (motivo de cancelación). null si se canceló el diálogo.
export function pedirMotivo(pregunta: string) {
  const m = prompt(pregunta)?.trim();
  return m ? m.slice(0, 200) : null;
}
