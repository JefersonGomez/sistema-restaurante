import { describe, expect, it } from 'vitest';
import { tiempoTranscurrido } from './tiempo';

const seg = (s: number) => s * 1000;

describe('tiempoTranscurrido', () => {
  it('menos de 1 h: m:ss', () => {
    expect(tiempoTranscurrido(0)).toBe('0:00');
    expect(tiempoTranscurrido(seg(65))).toBe('1:05');
    expect(tiempoTranscurrido(seg(3599))).toBe('59:59');
  });
  it('de 1 a 24 h: X h Y min', () => {
    expect(tiempoTranscurrido(seg(3600))).toBe('1 h 0 min');
    expect(tiempoTranscurrido(seg(2 * 3600 + 25 * 60 + 40))).toBe('2 h 25 min');
  });
  it('más de 24 h: X d Y h (nada de "15784 min")', () => {
    expect(tiempoTranscurrido(seg(15784 * 60))).toBe('10 d 23 h');
  });
  it('un reloj adelantado no da negativos', () => {
    expect(tiempoTranscurrido(-5000)).toBe('0:00');
  });
});
