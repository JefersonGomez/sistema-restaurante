import { describe, expect, it } from 'vitest';
import { normalizarTelefono } from './index';

describe('normalizarTelefono', () => {
  it('deja los últimos 8 dígitos: el mismo cliente en cualquier formato', () => {
    expect(normalizarTelefono('8888 1234')).toBe('88881234');
    expect(normalizarTelefono('8888-1234')).toBe('88881234');
    expect(normalizarTelefono('+506 8888 1234')).toBe('88881234');
    expect(normalizarTelefono('(506) 8888-1234')).toBe('88881234');
  });
});
