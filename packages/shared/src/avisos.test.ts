import { describe, expect, it } from 'vitest';
import { avisoAgrupado } from './avisos';

describe('avisoAgrupado', () => {
  it('avisa una vez por tanda y solo cuando aparecen ids nuevos', () => {
    const ya = new Set<string>();
    const avisos: number[] = [];
    const tick = (ids: string[]) => avisoAgrupado(ya, ids, (n) => avisos.push(n));
    tick(['a', 'b']); // dos de golpe → un aviso con el total
    tick(['a', 'b']); // nada nuevo → no suena otra vez
    tick(['a', 'b', 'c']); // uno nuevo → aviso con el total actual
    tick(['c']); // a y b se resolvieron
    tick(['a', 'c']); // a vuelve a entrar → cuenta como nuevo
    tick([]);
    expect(avisos).toEqual([2, 3, 2]);
  });
});
