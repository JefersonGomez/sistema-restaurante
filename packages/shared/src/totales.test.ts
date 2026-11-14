import { describe, expect, it } from 'vitest';
import { calcularTotales, type ConfigImpuestos } from './totales';

const sinIncluir: ConfigImpuestos = {
  porcentajeIva: 13,
  porcentajeServicio: 10,
  preciosIncluyenImpuestos: false,
};
const incluidos: ConfigImpuestos = { ...sinIncluir, preciosIncluyenImpuestos: true };

describe('calcularTotales', () => {
  it('cuenta vacía da todo en cero', () => {
    expect(calcularTotales([], incluidos)).toEqual({
      subtotal: 0,
      montoServicio: 0,
      montoIva: 0,
      total: 0,
    });
  });

  it('precios SIN impuestos: suma servicio e IVA sobre la base', () => {
    // 2 × ₡4 800 + 1 × ₡1 500 = ₡11 100
    const t = calcularTotales(
      [
        { precioUnitario: 480000, cantidad: 2 },
        { precioUnitario: 150000, cantidad: 1 },
      ],
      sinIncluir,
    );
    expect(t).toEqual({
      subtotal: 1110000,
      montoServicio: 111000,
      montoIva: 144300,
      total: 1365300,
    });
  });

  it('precios CON IVA incluido: se desglosa el IVA y el servicio (sobre la base) se suma', () => {
    // ₡4 800 → base 4800/1.13 = 4247.787… → ₡4 247,79 ; IVA ₡552,21 ; servicio ₡424,78
    const t = calcularTotales([{ precioUnitario: 480000, cantidad: 1 }], incluidos);
    expect(t).toEqual({ subtotal: 424779, montoServicio: 42478, montoIva: 55221, total: 522478 });
    expect(t.subtotal + t.montoServicio + t.montoIva).toBe(t.total);
  });

  it('precios CON IVA incluido y sin servicio: el total es el del menú', () => {
    const cfg = { ...incluidos, porcentajeServicio: 0 };
    expect(calcularTotales([{ precioUnitario: 113000, cantidad: 1 }], cfg)).toEqual({
      subtotal: 100000,
      montoServicio: 0,
      montoIva: 13000,
      total: 113000,
    });
  });

  it('sin servicio (0%) solo aplica IVA', () => {
    const cfg = { ...sinIncluir, porcentajeServicio: 0 };
    expect(calcularTotales([{ precioUnitario: 100000, cantidad: 1 }], cfg)).toEqual({
      subtotal: 100000,
      montoServicio: 0,
      montoIva: 13000,
      total: 113000,
    });
  });

  it('los ítems cancelados no suman', () => {
    const lineas = [
      { precioUnitario: 480000, cantidad: 1 },
      { precioUnitario: 999999, cantidad: 3, cancelado: true },
    ];
    expect(calcularTotales(lineas, incluidos)).toEqual(
      calcularTotales([{ precioUnitario: 480000, cantidad: 1 }], incluidos),
    );
    expect(
      calcularTotales([{ precioUnitario: 500, cantidad: 2, cancelado: true }], sinIncluir).total,
    ).toBe(0);
  });

  it('redondea mitad hacia arriba (sin impuestos incluidos)', () => {
    // 5 céntimos × 10% = 0.5 → 1 ; × 13% = 0.65 → 1
    expect(calcularTotales([{ precioUnitario: 5, cantidad: 1 }], sinIncluir)).toEqual({
      subtotal: 5,
      montoServicio: 1,
      montoIva: 1,
      total: 7,
    });
    // 15 céntimos: 1.5 → 2 ; 1.95 → 2
    expect(calcularTotales([{ precioUnitario: 15, cantidad: 1 }], sinIncluir)).toMatchObject({
      montoServicio: 2,
      montoIva: 2,
    });
    // 14 céntimos: 1.4 → 1 ; 1.82 → 2
    expect(calcularTotales([{ precioUnitario: 14, cantidad: 1 }], sinIncluir)).toMatchObject({
      montoServicio: 1,
      montoIva: 2,
    });
  });

  it('redondea sobre la suma de la cuenta, no por línea', () => {
    // 3 líneas de 5 céntimos: por línea daría 3 × 1 = 3 de servicio; sobre la suma 15 × 10% = 1.5 → 2
    const t = calcularTotales(
      [1, 2, 3].map(() => ({ precioUnitario: 5, cantidad: 1 })),
      sinIncluir,
    );
    expect(t.montoServicio).toBe(2);
  });

  it('con IVA incluido el desglose siempre cuadra y el menú + servicio da el total', () => {
    for (let precio = 1; precio <= 5000; precio += 7) {
      const t = calcularTotales([{ precioUnitario: precio, cantidad: 3 }], incluidos);
      expect(t.total).toBe(precio * 3 + t.montoServicio);
      expect(t.subtotal + t.montoIva).toBe(precio * 3);
      expect(t.subtotal + t.montoServicio + t.montoIva).toBe(t.total);
      expect(t.montoIva).toBeGreaterThanOrEqual(0);
    }
  });

  it('rechaza montos con decimales', () => {
    expect(() => calcularTotales([{ precioUnitario: 12.5, cantidad: 1 }], sinIncluir)).toThrow();
  });
});

describe('IVA por plato (Fase 13)', () => {
  it('sin tarifa propia o con la misma del restaurante da igual que antes', () => {
    const base = [{ precioUnitario: 480000, cantidad: 1 }];
    expect(calcularTotales([{ ...base[0]!, tarifaIva: 13 }], incluidos)).toEqual(
      calcularTotales(base, incluidos),
    );
    expect(calcularTotales([{ ...base[0]!, tarifaIva: null }], sinIncluir)).toEqual(
      calcularTotales(base, sinIncluir),
    );
  });

  it('suma cada tarifa por separado', () => {
    // ₡1 000 al 13 % + ₡1 000 exento, precios sin impuestos.
    expect(
      calcularTotales(
        [
          { precioUnitario: 100000, cantidad: 1 },
          { precioUnitario: 100000, cantidad: 1, tarifaIva: 0 },
        ],
        sinIncluir,
      ),
    ).toEqual({ subtotal: 200000, montoServicio: 20000, montoIva: 13000, total: 233000 });
    // Precios con IVA: ₡1 130 al 13 % (base 1 000) + ₡1 040 al 4 % (base 1 000).
    const t = calcularTotales(
      [
        { precioUnitario: 113000, cantidad: 1 },
        { precioUnitario: 104000, cantidad: 1, tarifaIva: 4 },
      ],
      incluidos,
    );
    expect(t).toEqual({ subtotal: 200000, montoServicio: 20000, montoIva: 17000, total: 237000 });
    expect(t.subtotal + t.montoServicio + t.montoIva).toBe(t.total);
  });
});
