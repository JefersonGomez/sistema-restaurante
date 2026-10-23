// Enlace de Google Maps válido: https y dominio de Google (google.com, google.co.cr…) o goo.gl.
export function esEnlaceDeMaps(u: string) {
  try {
    const { protocol, hostname } = new URL(u);
    const host = hostname.toLowerCase();
    return (
      protocol === 'https:' &&
      (host === 'goo.gl' ||
        host.endsWith('.goo.gl') ||
        /(^|\.)google\.(com|[a-z]{2}|com?\.[a-z]{2})$/.test(host))
    );
  } catch {
    return false;
  }
}

// Mapa incrustado sin clave de API (busca la dirección) y "Cómo llegar" (el enlace del dueño o
// una ruta hacia la dirección).
export const mapaIncrustado = (direccion: string) =>
  `https://www.google.com/maps?q=${encodeURIComponent(direccion)}&output=embed`;
export const comoLlegar = (ubicacionUrl: string | null, direccion: string | null) =>
  ubicacionUrl ??
  (direccion
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(direccion)}`
    : null);
