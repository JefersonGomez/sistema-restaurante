import { describe, expect, it } from 'vitest';
import { estadoSuscripcion, montoSugerido, nuevoVencimiento } from './planes';

const ahora = new Date('2026-11-01T12:00:00Z');
const enDias = (d: number) => new Date(ahora.getTime() + d * 86_400_000);

describe('planes', () => {
  it('monto: mensual por mes y el anual cobra 10 de 12', () => {
    expect(montoSugerido('BASICO', 1)).toBe(990_000);
    expect(montoSugerido('COMPLETO', 3)).toBe(5_970_000);
    expect(montoSugerido('BASICO', 12)).toBe(9_900_000);
    expect(montoSugerido('COMPLETO', 14)).toBe(1_990_000 * 12);
  });

  it('estado: suspendido, prueba, al día, por vencer y vencido', () => {
    const r = (dias: number | null, pagos = 1, activo = true) => ({
      activo,
      pagos,
      planVenceEn: dias === null ? null : enDias(dias),
    });
    expect(estadoSuscripcion(r(20, 1, false), ahora)).toBe('SUSPENDIDO');
    expect(estadoSuscripcion(r(20, 0), ahora)).toBe('PRUEBA');
    expect(estadoSuscripcion(r(20), ahora)).toBe('AL_DIA');
    expect(estadoSuscripcion(r(5), ahora)).toBe('POR_VENCER');
    expect(estadoSuscripcion(r(-1), ahora)).toBe('VENCIDO');
    expect(estadoSuscripcion(r(-1, 0), ahora)).toBe('VENCIDO'); // prueba vencida
    expect(estadoSuscripcion(r(null), ahora)).toBe('VENCIDO');
  });

  it('vencimiento: suma desde hoy si ya venció, o desde el vencimiento si está al día', () => {
    expect(nuevoVencimiento(enDias(-10), 1, ahora).toISOString()).toBe('2026-12-01T12:00:00.000Z');
    expect(nuevoVencimiento(enDias(10), 1, ahora).toISOString()).toBe('2026-12-11T12:00:00.000Z');
    expect(nuevoVencimiento(null, 2, ahora).toISOString()).toBe('2027-01-01T12:00:00.000Z');
  });
});
