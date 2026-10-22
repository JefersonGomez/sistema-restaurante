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
        conectado ? 'bg-emerald-100 text-emerald-800' : 'animate-pulse bg-red-100 text-red-800'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${conectado ? 'bg-emerald-600' : 'bg-red-600'}`} />
      <span className="max-sm:sr-only">{conectado ? 'Conectado' : 'Reconectando…'}</span>
    </span>
  );
}

const PANTALLAS_DUENO = [
  { ruta: '/dueno', texto: 'Hoy' },
  { ruta: '/cocina', texto: 'Cocina/Bar' },
  { ruta: '/mesero', texto: 'Mesero' },
  { ruta: '/caja', texto: 'Caja' },
];

export function Encabezado({ titulo, children }: { titulo: string; children?: ReactNode }) {
  const { usuario, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 bg-white shadow-sm print:hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-stone-800">{titulo}</h1>
          <p className="truncate text-xs text-stone-500">
            {usuario?.nombre}
            {usuario?.restaurante ? ` · ${usuario.restaurante.nombre}` : ''}
          </p>
        </div>
        {children}
        <button
          type="button"
          onClick={logout}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          Salir
        </button>
      </div>
      {usuario?.rol === 'DUENO' && (
        <nav className="flex gap-1 overflow-x-auto border-t border-stone-100 px-2 text-sm">
          {PANTALLAS_DUENO.map((p) => (
            <NavLink
              key={p.ruta}
              to={p.ruta}
              className={({ isActive }) =>
                `shrink-0 px-3 py-2 ${isActive ? 'border-b-2 border-teal-700 font-medium text-teal-800' : 'text-stone-500'}`
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
      className="animate-pulse rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white"
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
