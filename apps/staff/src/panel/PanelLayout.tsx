import {
  BarChart3,
  ChefHat,
  ConciergeBell,
  Globe,
  House,
  LogOut,
  Menu as MenuIcono,
  Palette,
  QrCode,
  ReceiptText,
  Settings,
  TabletSmartphone,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';
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
  { a: '/panel/personalizar', texto: 'Personalizar', Icono: Palette },
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
  { a: '/en-linea', texto: 'Pedidos en línea', Icono: Globe },
];

// En escritorio la barra está reducida a íconos y los textos aparecen al desplegarla
// (cursor encima o foco con teclado). En el cajón del celular se ven siempre.
const texto =
  'whitespace-nowrap transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100';

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
    isActive ? 'bg-purple-soft font-semibold text-purple' : 'text-fg hover:bg-surface'
  }`;

function Lista({ enlaces, onIr }: { enlaces: Enlace[]; onIr?: () => void }) {
  return (
    <ul className="space-y-1">
      {enlaces.map(({ a, texto: nombre, Icono, fin }) => (
        <li key={a}>
          <NavLink to={a} end={fin} className={claseEnlace} onClick={onIr} title={nombre}>
            <Icono className="size-5 shrink-0" aria-hidden />
            <span className={texto}>{nombre}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Navegacion({ onIr }: { onIr?: () => void }) {
  const { usuario, logout } = useAuth();
  const nombre = usuario?.restaurante?.nombre ?? '';
  return (
    <div className="flex h-full flex-col gap-6 overflow-x-hidden overflow-y-auto p-3">
      <div className="flex items-center gap-3 px-0.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-purple text-lg font-bold text-on-accent">
          {nombre.charAt(0)}
        </span>
        <span className={`min-w-0 ${texto}`}>
          <span className="block truncate font-semibold">{nombre}</span>
          <span className="block text-xs text-muted">{usuario?.nombre} · Dueño</span>
        </span>
      </div>
      <nav aria-label="Administración" className="flex flex-col gap-5">
        <Lista enlaces={ADMINISTRAR} onIr={onIr} />
        <div>
          <p
            className={`mb-2 px-3 text-xs font-semibold tracking-wide text-muted uppercase ${texto}`}
          >
            Operación
          </p>
          <Lista enlaces={OPERAR} onIr={onIr} />
        </div>
      </nav>
      <button
        type="button"
        onClick={logout}
        title="Salir"
        className="mt-auto flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted hover:bg-surface"
      >
        <LogOut className="size-5 shrink-0" aria-hidden />
        <span className={texto}>Salir</span>
      </button>
    </div>
  );
}

export function PanelLayout() {
  const { usuario } = useAuth();
  const [cajon, setCajon] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!cajon) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCajon(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cajon]);

  return (
    <div className="min-h-dvh bg-bg">
      {/* Escritorio y tablet: barra de íconos que se despliega encima del contenido. */}
      <aside className="group fixed inset-y-0 left-0 z-30 hidden w-[72px] border-r border-line bg-app transition-[width,box-shadow] duration-200 ease-out focus-within:w-60 focus-within:shadow-app hover:w-60 hover:shadow-app md:block">
        <Navegacion />
      </aside>

      {/* Celular: encabezado con el botón del menú desplegable. */}
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line bg-app px-2 py-1.5 md:hidden">
        <button
          type="button"
          onClick={() => setCajon(true)}
          aria-label="Abrir el menú"
          aria-expanded={cajon}
          className="grid size-11 place-items-center rounded-md hover:bg-surface"
        >
          <MenuIcono className="size-6" aria-hidden />
        </button>
        <p className="min-w-0 flex-1 truncate font-semibold">{usuario?.restaurante?.nombre}</p>
        <BotonSonido />
        <Campana />
      </header>

      <main className="md:pl-[72px]">
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-10 md:px-8 md:pt-3">
          <div className="mb-2 hidden justify-end gap-2 md:flex">
            <BotonSonido />
            <Campana />
          </div>
          <div key={pathname} className="anim-entrar">
            <Outlet />
          </div>
        </div>
      </main>

      {cajon && (
        <div
          className="anim-aparecer fixed inset-0 z-40 bg-scrim md:hidden"
          onClick={() => setCajon(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            onClick={(e) => e.stopPropagation()}
            className="anim-cajon absolute inset-y-0 left-0 w-[min(84vw,300px)] bg-app pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-app"
          >
            <button
              type="button"
              onClick={() => setCajon(false)}
              aria-label="Cerrar el menú"
              className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full hover:bg-surface"
            >
              <X className="size-5" aria-hidden />
            </button>
            <Navegacion onIr={() => setCajon(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
