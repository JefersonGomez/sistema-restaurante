// Gorro de KitchaGo en SVG. `animado`: cae y rebota en bucle (carga); `unaVez`: solo al aparecer.
// Colores de marca en tokens.css (--kg-coral, --kg-tinta).
export function LogoGorro({
  tam = 88,
  animado = false,
  unaVez = false,
  className = '',
}: {
  tam?: number;
  animado?: boolean;
  unaVez?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={tam}
      height={tam}
      aria-hidden
      className={`${animado ? 'kg-animado' : ''} ${unaVez ? 'kg-una-vez' : ''} ${className}`}
    >
      <rect
        className="kg-banda"
        x="15"
        y="47"
        width="34"
        height="7"
        rx="3.5"
        fill="var(--kg-coral)"
      />
      <g className="kg-gorro">
        <g fill="var(--kg-coral)">
          <circle cx="21" cy="24" r="11" />
          <circle cx="32" cy="17" r="13" />
          <circle cx="43" cy="24" r="11" />
          <rect x="13" y="22" width="38" height="21" rx="4" />
        </g>
        <path
          className="kg-check"
          d="M24 31.5l6 6 11.5-11.5"
          fill="none"
          stroke="var(--kg-tinta)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

// Animación de carga: el gorro de KitchaGo cae y rebota (con "reducir movimiento", quieto).
export function Cargando({ texto, pantalla = true }: { texto?: string; pantalla?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 ${pantalla ? 'min-h-dvh bg-app' : 'py-16'}`}
    >
      <LogoGorro animado />
      {texto && <p className="text-sm font-medium text-muted">{texto}</p>}
    </div>
  );
}

// Mesa vista desde arriba con cuatro sillas.
export function IconoMesa({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="3" strokeWidth="1.8" />
      <g strokeWidth="2.2" strokeLinecap="round">
        <path d="M9.5 2.5h5" />
        <path d="M9.5 21.5h5" />
        <path d="M2.5 9.5v5" />
        <path d="M21.5 9.5v5" />
      </g>
    </svg>
  );
}
