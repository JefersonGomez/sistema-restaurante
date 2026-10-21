import { describe, expect, it } from 'vitest';
import { estaAbierto } from './horario';

// Hora de Costa Rica = UTC − 6 → las 07:00 en CR son las 13:00 UTC.
const enCR = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00-06:00`);

describe('estaAbierto', () => {
  it('sin horario configurado siempre está abierto', () => {
    expect(estaAbierto(null, null, enCR('03:00'))).toBe(true);
    expect(estaAbierto('07:00', null, enCR('03:00'))).toBe(true);
  });

  it('horario normal: abre incluido, cierra excluido', () => {
    expect(estaAbierto('07:00', '21:00', enCR('06:59'))).toBe(false);
    expect(estaAbierto('07:00', '21:00', enCR('07:00'))).toBe(true);
    expect(estaAbierto('07:00', '21:00', enCR('20:59'))).toBe(true);
    expect(estaAbierto('07:00', '21:00', enCR('21:00'))).toBe(false);
  });

  it('horario que cruza la medianoche', () => {
    expect(estaAbierto('18:00', '02:00', enCR('23:30'))).toBe(true);
    expect(estaAbierto('18:00', '02:00', enCR('01:59'))).toBe(true);
    expect(estaAbierto('18:00', '02:00', enCR('02:00'))).toBe(false);
    expect(estaAbierto('18:00', '02:00', enCR('12:00'))).toBe(false);
  });

  it('usa la hora de Costa Rica aunque el servidor esté en UTC', () => {
    // 02:00 UTC = 20:00 del día anterior en Costa Rica
    expect(estaAbierto('07:00', '21:00', new Date('2026-10-22T02:00:00Z'))).toBe(true);
  });

  it('apertura igual a cierre = 24 horas', () => {
    expect(estaAbierto('00:00', '00:00', enCR('15:00'))).toBe(true);
  });
});
