import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  ChefHat,
  ExternalLink,
  Store,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { DemoInfo, RolPersonal } from '@menu-qr/shared';
import { Cargando } from '@menu-qr/ui';
import { api, entrarDemo } from './api';
import { useAuth } from './auth';

// Demo de una visita (Fase 21): cada visitante recibe su propio restaurante de ejemplo.
const ROLES: { rol: RolPersonal; texto: string; detalle: string; icono: LucideIcon }[] = [
  {
    rol: 'DUENO',
    texto: 'Dueño',
    detalle: 'Menú, mesas, reportes y ajustes. Desde aquí llega a todas las pantallas.',
    icono: Store,
  },
  {
    rol: 'MESERO',
    texto: 'Mesero',
    detalle: 'Las mesas, quién llama y qué platos están listos para llevar.',
    icono: UtensilsCrossed,
  },
  {
    rol: 'COCINA',
    texto: 'Cocina',
    detalle: 'Las comandas que llegan; un toque para marcarlas listas.',
    icono: ChefHat,
  },
  {
    rol: 'CAJA',
    texto: 'Caja',
    detalle: 'Cobrar cuentas, pedidos en línea y el cierre del día.',
    icono: Wallet,
  },
  {
    rol: 'REPARTIDOR',
    texto: 'Repartidor',
    detalle: 'Sus entregas, la ruta y el cobro al cliente.',
    icono: Bike,
  },
];

export function DemoPage() {
  const { entrarDemo: entrar } = useAuth();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');

  const elegir = async (rol: RolPersonal) => {
    setError('');
    setCreando(true);
    try {
      await entrar(rol);
    } catch (e) {
      setError((e as Error).message);
      setCreando(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      {creando && (
        <div className="anim-aparecer fixed inset-0 z-50">
          <Cargando texto="Preparando su restaurante de prueba…" />
        </div>
      )}
      <div className="w-full max-w-2xl space-y-5 rounded-[26px] bg-app p-6 shadow-app">
        <div>
          <p className="mb-3 font-display text-lg font-extrabold tracking-[-0.02em] text-purple">
            KitchaGo
          </p>
          <h1 className="text-[22px] font-semibold">Pruebe KitchaGo con una demo</h1>
          <p className="mt-1 text-sm text-muted">
            Le creamos una soda de ejemplo con menú, mesas ocupadas, pedidos y un mes de ventas. Es
            solo suya y se borra sola en 24 horas. Adentro puede cambiar de pantalla cuando quiera.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map(({ rol, texto, detalle, icono: Icono }) => (
            <li key={rol} className={rol === 'DUENO' ? 'sm:col-span-2' : ''}>
              <button
                type="button"
                disabled={creando}
                onClick={() => elegir(rol)}
                className={`flex h-full w-full items-start gap-3 rounded-xl p-4 text-left ring-1 ring-line hover:bg-surface disabled:opacity-60 ${rol === 'DUENO' ? 'bg-purple-soft' : 'bg-app'}`}
              >
                <Icono className="mt-0.5 size-6 shrink-0 text-purple" aria-hidden />
                <span>
                  <span className="block font-semibold">
                    Entrar como {texto.toLowerCase()}
                    {rol === 'DUENO' && <span className="text-muted"> (recomendado)</span>}
                  </span>
                  <span className="block text-sm text-muted">{detalle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <p className="text-center text-sm text-muted">
          ¿Ya lo decidió?{' '}
          <Link to="/registro" className="font-semibold text-purple underline">
            Cree su cuenta con 30 días gratis
          </Link>
        </p>
      </div>
    </main>
  );
}

const horasQueQuedan = (iso: string) =>
  Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 3_600_000));
const enlace =
  'inline-flex min-h-9 items-center gap-1 rounded-md px-2 font-semibold underline-offset-2 hover:underline';

// Franja arriba de todas las pantallas mientras se usa una demo.
export function FranjaDemo() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  // En el panel, la barra lateral fija (72 px) tapa el borde izquierdo.
  const conBarra = useLocation().pathname.startsWith('/panel');
  const [cambiando, setCambiando] = useState(false);
  const info = useQuery({ queryKey: ['demo'], queryFn: () => api<DemoInfo>('/demo') });

  // Recarga completa: la sesión nueva (cookie) arranca limpia con el otro rol.
  const verComo = async (rol: string) => {
    setCambiando(true);
    try {
      await entrarDemo(rol, true);
      window.location.assign('/');
    } catch {
      setCambiando(false);
    }
  };
  const crearCuenta = async () => {
    await logout();
    navigate('/registro');
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-soft px-4 py-1.5 text-sm text-amber-ink ${conBarra ? 'md:pl-[88px]' : ''}`}
    >
      <span className="font-semibold">
        Demo
        {info.data && (
          <span className="font-normal"> · se borra en {horasQueQuedan(info.data.expiraEn)} h</span>
        )}
      </span>
      <label className="inline-flex items-center gap-1">
        <span>Ver como</span>
        <select
          value={usuario?.rol}
          disabled={cambiando}
          onChange={(e) => verComo(e.target.value)}
          className="min-h-9 rounded-md border border-line bg-app px-2 text-fg"
        >
          {ROLES.map((r) => (
            <option key={r.rol} value={r.rol}>
              {r.texto}
            </option>
          ))}
        </select>
      </label>
      {info.data?.mesaUrl && (
        <a href={info.data.mesaUrl} target="_blank" rel="noreferrer" className={enlace}>
          Pedir desde una mesa <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
      {info.data && (
        <a href={info.data.enLineaUrl} target="_blank" rel="noreferrer" className={enlace}>
          Pedir en línea <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
      <button type="button" onClick={crearCuenta} className={`${enlace} ml-auto`}>
        Crear mi cuenta
      </button>
    </div>
  );
}
