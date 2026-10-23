import {
  BarChart3,
  ChefHat,
  ConciergeBell,
  House,
  LogOut,
  Menu as MenuIcono,
  QrCode,
  ReceiptText,
  Settings,
  TabletSmartphone,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { BotonSonido, Campana } from '../ui';

type Enlace = {
  a: string;
  texto: string;
  Icono: ComponentType<{ className?: string }>;
  fin?: boolean;
};

const ADMINISTRAR: Enlace[] = [
  { a: '/panel', texto: 'Inicio', Icono: House, fin: true },
  { a: '/panel/menu', texto: 'Menú', Icono: UtensilsCrossed },
  { a: '/panel/mesas', texto: 'Mesas y QR', Icono: QrCode },
  { a: '/panel/personal', texto: 'Personal', Icono: Users },
  { a: '/panel/dispositivos', texto: 'Dispositivos', Icono: TabletSmartphone },
  { a: '/panel/reportes', texto: 'Reportes', Icono: BarChart3 },
  { a: '/panel/ajustes', texto: 'Ajustes', Icono: Settings },
];
const OPERAR: Enlace[] = [
  { a: '/cocina', texto: 'Cocina y bar', Icono: ChefHat },
  { a: '/mesero', texto: 'Mesero', Icono: ConciergeBell },
  { a: '/caja', texto: 'Caja', Icono: ReceiptText },
];
// En el celular: los 4 más usados abajo + "Más".
const ABAJO = ADMINISTRAR.filter((e) =>
  ['/panel', '/panel/menu', '/panel/mesas', '/panel/reportes'].includes(e.a),
);

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
    isActive ? 'bg-purple-soft font-semibold text-purple' : 'text-fg hover:bg-surface'
  }`;

function Lista({ enlaces, onIr }: { enlaces: Enlace[]; onIr?: () => void }) {
  return (
    <ul className="space-y-1">
      {enlaces.map(({ a, texto, Icono, fin }) => (
        <li key={a}>
          <NavLink to={a} end={fin} className={claseEnlace} onClick={onIr}>
            <Icono className="size-5" aria-hidden />
            {texto}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Navegacion({ onIr }: { onIr?: () => void }) {
  const { usuario, logout } = useAuth();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div>
        <p className="text-lg font-semibold">{usuario?.restaurante?.nombre}</p>
        <p className="text-xs text-muted">{usuario?.nombre} · Dueño</p>
      </div>
      <nav aria-label="Administración" className="flex flex-col gap-6">
        <Lista enlaces={ADMINISTRAR} onIr={onIr} />
        <div>
          <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Operación
          </p>
          <Lista enlaces={OPERAR} onIr={onIr} />
        </div>
      </nav>
      <button
        type="button"
        onClick={logout}
        className="mt-auto flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted hover:bg-surface"
      >
        <LogOut className="size-5" aria-hidden /> Salir
      </button>
    </div>
  );
}

// Barra lateral en escritorio y tablet; navegación inferior + menú "Más" en el celular.
export function PanelLayout() {
  const [masAbierto, setMasAbierto] = useState(false);
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-app md:block">
        <Navegacion />
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 pt-3 pb-28 md:px-8 md:pb-10">
        <div className="mb-2 flex justify-end gap-2">
          <BotonSonido />
          <Campana />
        </div>
        <div key={pathname} className="anim-entrar">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Navegación"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-app px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] md:hidden"
      >
        {ABAJO.map(({ a, texto, Icono, fin }) => (
          <NavLink
            key={a}
            to={a}
            end={fin}
            className={({ isActive }) =>
              `flex min-h-11 flex-col items-center gap-1 text-[11px] ${isActive ? 'font-semibold text-purple' : 'text-muted'}`
            }
          >
            <Icono className="size-[22px]" aria-hidden />
            {texto.split(' ')[0]}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMasAbierto(true)}
          className="flex min-h-11 flex-col items-center gap-1 text-[11px] text-muted"
        >
          <MenuIcono className="size-[22px]" aria-hidden />
          Más
        </button>
      </nav>

      {masAbierto && (
        <div
          className="anim-aparecer fixed inset-0 z-30 bg-scrim md:hidden"
          onClick={() => setMasAbierto(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Más opciones"
            onClick={(e) => e.stopPropagation()}
            className="anim-subir absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[26px] bg-app pb-[env(safe-area-inset-bottom)]"
          >
            <button
              type="button"
              onClick={() => setMasAbierto(false)}
              aria-label="Cerrar"
              className="absolute top-3 right-3 grid size-11 place-items-center rounded-full hover:bg-surface"
            >
              <X className="size-5" aria-hidden />
            </button>
            <Navegacion onIr={() => setMasAbierto(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
