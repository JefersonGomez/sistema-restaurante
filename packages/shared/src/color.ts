// Contraste WCAG 2.1 entre dos colores "#rrggbb" (1 a 21).

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminancia(hex: string) {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

export function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

// El acento lleva texto blanco encima (botones): se exige 4.5:1 (WCAG AA, texto normal).
export const CONTRASTE_MINIMO = 4.5;
export const acentoLegible = (hex: string) =>
  HEX.test(hex) && contraste(hex, '#ffffff') >= CONTRASTE_MINIMO;
