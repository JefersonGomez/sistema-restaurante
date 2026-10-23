import { describe, expect, it } from 'vitest';
import {
  estaAbierto,
  fechaLocal,
  menuDelDiaHoy,
  turnosDeHoy,
  zonaHorariaValida,
  type Turno,
} from './horario';

const CR = 'America/Costa_Rica'; // UTC−6, sin horario de verano
// 2026-10-19 es lunes. `cr('lun', '07:00')` = ese momento en hora de Costa Rica.
const DIAS = { dom: 18, lun: 19, mar: 20, sab: 24 } as const;
const cr = (dia: keyof typeof DIAS, hhmm: string) =>
  new Date(`2026-10-${DIAS[dia]}T${hhmm}:00-06:00`);

// Soda La Esquina: lunes a sábado 7:00–21:00, domingo 8:00–15:00.
const soda: Turno[] = [
  ...[1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, abre: '07:00', cierra: '21:00' })),
  { diaSemana: 0, abre: '08:00', cierra: '15:00' },
];

describe('estaAbierto', () => {
  it('turnos normales: abre incluido, cierra excluido', () => {
    expect(estaAbierto(soda, cr('lun', '06:59'), CR)).toBe(false);
    expect(estaAbierto(soda, cr('lun', '07:00'), CR)).toBe(true);
    expect(estaAbierto(soda, cr('lun', '20:59'), CR)).toBe(true);
    expect(estaAbierto(soda, cr('lun', '21:00'), CR)).toBe(false);
    expect(estaAbierto(soda, cr('dom', '15:30'), CR)).toBe(false);
    expect(estaAbierto(soda, cr('dom', '09:00'), CR)).toBe(true);
  });

  it('varios turnos el mismo día (almuerzo y cena)', () => {
    const turnos = [
      { diaSemana: 1, abre: '11:00', cierra: '15:00' },
      { diaSemana: 1, abre: '18:00', cierra: '22:00' },
    ];
    expect(estaAbierto(turnos, cr('lun', '12:00'), CR)).toBe(true);
    expect(estaAbierto(turnos, cr('lun', '16:00'), CR)).toBe(false);
    expect(estaAbierto(turnos, cr('lun', '19:30'), CR)).toBe(true);
  });

  it('turnos que cruzan la medianoche', () => {
    const sabadoNoche = [{ diaSemana: 6, abre: '18:00', cierra: '02:00' }];
    expect(estaAbierto(sabadoNoche, cr('sab', '23:30'), CR)).toBe(true);
    expect(estaAbierto(sabadoNoche, new Date('2026-10-25T01:30:00-06:00'), CR)).toBe(true); // dom 1:30
    expect(estaAbierto(sabadoNoche, new Date('2026-10-25T02:00:00-06:00'), CR)).toBe(false);
    // El domingo a las 23:30 no: el turno es del sábado.
    expect(estaAbierto(sabadoNoche, cr('dom', '23:30'), CR)).toBe(false);
  });

  it('cierre manual gana sobre el horario', () => {
    expect(estaAbierto(soda, cr('lun', '12:00'), CR, true)).toBe(false);
    expect(estaAbierto([], cr('lun', '12:00'), CR, true)).toBe(false);
  });

  it('sin turnos configurados está siempre abierto; abre = cierra son 24 horas', () => {
    expect(estaAbierto([], cr('lun', '03:00'), CR)).toBe(true);
    expect(
      estaAbierto([{ diaSemana: 2, abre: '00:00', cierra: '00:00' }], cr('mar', '03:00'), CR),
    ).toBe(true);
  });

  it('usa la zona horaria del restaurante, no la del servidor', () => {
    // 02:00 UTC del martes = lunes 20:00 en Costa Rica (UTC−6, abierto) y lunes 21:00 en Bogotá
    // (UTC−5, ya cerró).
    const instante = new Date('2026-10-20T02:00:00Z');
    expect(estaAbierto(soda, instante, CR)).toBe(true);
    expect(estaAbierto(soda, instante, 'America/Bogota')).toBe(false);
  });
});

describe('turnosDeHoy y zonaHorariaValida', () => {
  it('devuelve los turnos del día local ordenados', () => {
    const turnos = [
      { diaSemana: 1, abre: '18:00', cierra: '22:00' },
      { diaSemana: 1, abre: '11:00', cierra: '15:00' },
      { diaSemana: 2, abre: '07:00', cierra: '21:00' },
    ];
    expect(turnosDeHoy(turnos, cr('lun', '10:00'), CR)).toEqual([
      { abre: '11:00', cierra: '15:00' },
      { abre: '18:00', cierra: '22:00' },
    ]);
  });

  it('valida zonas horarias IANA', () => {
    expect(zonaHorariaValida('America/Costa_Rica')).toBe(true);
    expect(zonaHorariaValida('Marte/Olympus')).toBe(false);
  });
});

describe('menuDelDiaHoy', () => {
  const zona = 'America/Costa_Rica';
  // Jueves 22 oct 2026, 23:30 en Costa Rica = viernes 23 oct 05:30 UTC.
  const juevesNoche = new Date('2026-10-23T05:30:00Z');
  it('por día de la semana, en la hora local (no la UTC)', () => {
    expect(menuDelDiaHoy({ diasSemana: [4], fechaMenu: null }, juevesNoche, zona)).toBe(true);
    expect(menuDelDiaHoy({ diasSemana: [5], fechaMenu: null }, juevesNoche, zona)).toBe(false);
  });
  it('a mano para una fecha puntual', () => {
    expect(menuDelDiaHoy({ diasSemana: [], fechaMenu: '2026-10-22' }, juevesNoche, zona)).toBe(
      true,
    );
    expect(menuDelDiaHoy({ diasSemana: [], fechaMenu: '2026-10-23' }, juevesNoche, zona)).toBe(
      false,
    );
    expect(fechaLocal(juevesNoche, zona)).toBe('2026-10-22');
  });
});
