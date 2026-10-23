import {
  ChevronLeft,
  House,
  QrCode,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  WifiOff,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAvisos } from '../estado/avisos';
import { useTextos } from '../estado/idioma';

// Ocupa toda la pantalla (celular, tablet o PC). Respeta las áreas seguras (notch).
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-app pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <div className="relative flex min-h-dvh flex-col">{children}</div>
    </div>
  );
}

export function Main({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-[22px] px-5 pt-[22px] pb-7 md:px-8 md:pt-8">
      {children}
    </main>
  );
}

function Insignia({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute top-0 left-[calc(50%+6px)] grid md:static h-[18px] min-w-[18px] place-items-center rounded-full bg-amber px-[5px] text-[10px] font-bold text-on-amber">
      {n}
    </span>
  );
}

export function BottomNav({
  base,
  enCarrito,
  sinEntregar,
}: {
  base: string;
  enCarrito: number;
  sinEntregar: number;
}) {
  const t = useTextos();
  const enlaces = [
    { a: base, texto: t.menu, Icono: House, n: 0, fin: true },
    { a: `${base}/carrito`, texto: t.carrito, Icono: ShoppingCart, n: enCarrito, fin: false },
    { a: `${base}/cuenta`, texto: t.miCuenta, Icono: ReceiptText, n: sinEntregar, fin: false },
  ];
  return (
    <nav
      aria-label={t.menu}
      className="sticky bottom-0 z-10 mt-auto grid grid-cols-3 border-t border-line bg-app px-3 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] md:top-0 md:bottom-auto md:order-first md:mt-0 md:flex md:justify-center md:gap-2 md:border-t-0 md:border-b md:py-2"
    >
      {enlaces.map(({ a, texto, Icono, n, fin }) => (
        <NavLink
          key={a}
          to={a}
          end={fin}
          replace
          className={({ isActive }) =>
            `relative flex min-h-11 flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] md:flex-row md:gap-2 md:px-5 md:text-sm md:hover:bg-surface ${
              isActive ? 'font-semibold text-purple' : 'text-muted'
            }`
          }
        >
          <Icono className="size-[22px]" strokeWidth={1.9} aria-hidden />
          {texto}
          <Insignia n={n} />
        </NavLink>
      ))}
    </nav>
  );
}

export function Toast() {
  const { texto, id } = useAvisos();
  if (!texto) return null;
  return (
    <div
      key={id}
      role="status"
      className="anim-aparecer fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 md:bottom-8 z-40 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-[14px] bg-fg px-[18px] py-3 text-center text-[13.5px] text-app"
    >
      {texto}
    </div>
  );
}

export function SinConexion() {
  const t = useTextos();
  return (
    <p
      role="status"
      className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-fg px-3 py-1 text-[11.5px] font-medium text-app"
    >
      <WifiOff className="size-3.5" aria-hidden /> {t.sinConexion}
    </p>
  );
}

function PantallaCentro({
  icono,
  titulo,
  detalle,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  detalle: string;
  accion?: ReactNode;
}) {
  return (
    <Main>
      <div className="my-auto flex flex-col items-center gap-3 py-16 text-center">
        <div className="mb-2 grid size-20 place-items-center rounded-full bg-surface-2 text-purple">
          {icono}
        </div>
        <h1 className="text-xl font-semibold text-balance">{titulo}</h1>
        <p className="max-w-xs text-sm text-muted">{detalle}</p>
        {accion}
      </div>
    </Main>
  );
}

export function ErrorScreen({
  tipo,
  onReintentar,
}: {
  tipo: 'noEncontrado' | 'error' | 'sinMesa';
  onReintentar?: () => void;
}) {
  const t = useTextos();
  if (tipo === 'sinMesa')
    return (
      <PantallaCentro
        icono={<QrCode className="size-9" aria-hidden />}
        titulo={t.menu}
        detalle={t.sinMesa}
      />
    );
  return (
    <PantallaCentro
      icono={
        tipo === 'noEncontrado' ? (
          <QrCode className="size-9" aria-hidden />
        ) : (
          <WifiOff className="size-9" aria-hidden />
        )
      }
      titulo={tipo === 'noEncontrado' ? t.qrInvalido : t.errorCarga}
      detalle={tipo === 'noEncontrado' ? t.qrInvalidoDetalle : t.errorCargaDetalle}
      accion={
        onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            className="mt-3 flex h-12 items-center gap-2 rounded-md bg-purple px-6 font-semibold text-on-accent"
          >
            <RefreshCw className="size-4" aria-hidden /> {t.reintentar}
          </button>
        )
      }
    />
  );
}

export function ThankYouScreen() {
  const t = useTextos();
  return (
    <PantallaCentro
      icono={
        <span className="text-4xl" aria-hidden>
          🙌
        </span>
      }
      titulo={t.gracias}
      detalle={t.graciasDetalle}
    />
  );
}

// Encabezado de pantalla interna: flecha atrás, título centrado.
export function BarraTitulo({
  titulo,
  onVolver,
  children,
}: {
  titulo: string;
  onVolver?: () => void;
  children?: ReactNode;
}) {
  const t = useTextos();
  return (
    <div className="grid grid-cols-[44px_1fr_44px] items-center">
      {onVolver ? (
        <button
          type="button"
          onClick={onVolver}
          aria-label={t.volver}
          className="grid size-11 place-items-center rounded-[14px] hover:bg-surface"
        >
          <ChevronLeft className="size-[22px]" strokeWidth={1.9} aria-hidden />
        </button>
      ) : (
        <span />
      )}
      <h1 className="text-center text-[19px] font-semibold">{titulo}</h1>
      <span />
      {children && <div className="col-span-3 mt-1 flex justify-center">{children}</div>}
    </div>
  );
}
