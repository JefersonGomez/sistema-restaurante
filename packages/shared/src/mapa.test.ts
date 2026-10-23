import { describe, expect, it } from 'vitest';
import { comoLlegar, esEnlaceDeMaps } from './mapa';

describe('enlaces de Google Maps', () => {
  it('acepta solo https y dominios de Google', () => {
    for (const u of [
      'https://maps.app.goo.gl/abc123',
      'https://www.google.com/maps/place/x',
      'https://goo.gl/maps/x',
      'https://maps.google.co.cr/?q=1',
    ])
      expect(esEnlaceDeMaps(u)).toBe(true);
    for (const u of [
      'https://evil.com/google.com/maps',
      'https://google.evil.com/',
      'http://maps.app.goo.gl/x',
      'https://googlex.com/',
      'no es url',
    ])
      expect(esEnlaceDeMaps(u)).toBe(false);
  });

  it('"Cómo llegar" usa el enlace del dueño o arma la ruta a la dirección', () => {
    expect(comoLlegar('https://maps.app.goo.gl/a', 'X')).toBe('https://maps.app.goo.gl/a');
    expect(comoLlegar(null, 'San José, CR')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=San%20Jos%C3%A9%2C%20CR',
    );
    expect(comoLlegar(null, null)).toBeNull();
  });
});
