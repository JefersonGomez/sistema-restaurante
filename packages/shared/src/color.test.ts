import { describe, expect, it } from 'vitest';
import { acentoLegible, contraste } from './color';

describe('contraste', () => {
  it('negro sobre blanco es 21:1 y un color consigo mismo 1:1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contraste('#5b2db5', '#5b2db5')).toBeCloseTo(1, 5);
  });

  it('el morado del diseño se lee bien con texto blanco; el amarillo no', () => {
    expect(acentoLegible('#5B2DB5')).toBe(true);
    expect(acentoLegible('#F7A91C')).toBe(false);
    expect(acentoLegible('#ffff00')).toBe(false);
    expect(acentoLegible('rojo')).toBe(false);
  });
});
