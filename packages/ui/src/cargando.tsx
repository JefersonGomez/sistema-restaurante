// Animación de carga: un tenedor y un cuchillo que se cruzan. SVG + CSS (tokens.css), sin
// librerías; con "reducir movimiento" quedan quietos y cruzados.
export function Cargando({ texto, pantalla = true }: { texto?: string; pantalla?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 ${pantalla ? 'min-h-dvh bg-app' : 'py-16'}`}
    >
      <svg viewBox="0 0 64 64" width="88" height="88" aria-hidden className="cubiertos">
        {/* Tenedor */}
        <g className="cubiertos-tenedor" fill="var(--purple)">
          <rect x="22.5" y="6" width="3" height="16" rx="1.5" />
          <rect x="28.5" y="6" width="3" height="16" rx="1.5" />
          <rect x="34.5" y="6" width="3" height="16" rx="1.5" />
          <path d="M22.5 19h15v4a7.5 7.5 0 0 1-15 0z" />
          <rect x="27.5" y="26" width="5" height="33" rx="2.5" />
        </g>
        {/* Cuchillo */}
        <g className="cubiertos-cuchillo" fill="var(--amber)">
          <path d="M29 5c7 3 8.5 14 5.5 25h-5.5z" />
          <rect x="29" y="29" width="5.5" height="30" rx="2.75" />
        </g>
      </svg>
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
