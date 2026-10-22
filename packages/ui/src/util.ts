import type { Idioma, Moneda, PedidoDetalle } from '@menu-qr/shared';

// ₡4 800 (separador de miles con espacio, sin decimales si son cero); USD: $4.80.
export function formatoPrecio(moneda: Moneda) {
  if (moneda === 'USD') {
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    return (centimos: number) => f.format(centimos / 100);
  }
  return (centimos: number) => {
    const colones = Math.floor(centimos / 100);
    const resto = centimos % 100;
    const miles = String(colones).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `₡${miles}${resto ? `,${String(resto).padStart(2, '0')}` : ''}`;
  };
}

// "07:00" → "7:00 a. m." / "7:00 am"
export function formatoHora(hhmm: string, idioma: Idioma) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString(idioma === 'en' ? 'en-US' : 'es-CR', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

// Búsqueda sin tildes ni mayúsculas.
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

export const nombreEn = (x: { nombreEs: string; nombreEn: string }, idioma: Idioma) =>
  idioma === 'en' ? x.nombreEn : x.nombreEs;

// Paso de la barra de 5 (0 Enviado · 1 Confirmado · 2 En preparación · 3 Listo · 4 Entregado),
// según los ítems no cancelados; null si el pedido se canceló completo.
export function pasoPedido(p: Pick<PedidoDetalle, 'estado' | 'items'>): 0 | 1 | 2 | 3 | 4 | null {
  const activos = p.items.filter((i) => !i.cancelado);
  if (p.estado === 'CANCELADO' || activos.length === 0) return null;
  if (p.estado === 'PENDIENTE') return 0;
  if (activos.every((i) => i.estado === 'ENTREGADO')) return 4;
  if (activos.every((i) => i.estado === 'LISTO' || i.estado === 'ENTREGADO')) return 3;
  if (activos.some((i) => i.estado !== 'PENDIENTE')) return 2;
  return 1;
}
