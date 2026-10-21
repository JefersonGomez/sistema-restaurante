import { describe, expect, it } from 'vitest';
import { calcularTotales } from '@menu-qr/shared/totales';
import { claveLinea, conNota, fusionar, restar, type LineaCarrito } from '../src/estado/carrito';

const base = (extra: Partial<LineaCarrito> = {}): Omit<LineaCarrito, 'clave'> => ({
  platoId: 'casado',
  nombreEs: 'Casado con bistec',
  nombreEn: 'Casado with steak',
  icono: null,
  fotoUrl: null,
  cantidad: 1,
  nota: '',
  modificadores: ['medio'],
  modsEs: ['Término medio'],
  modsEn: ['Medium'],
  precioUnitario: 550000,
  ...extra,
});

describe('fusión de ítems iguales', () => {
  it('mismo plato, modificadores y nota → suma la cantidad', () => {
    let l = fusionar([], base());
    l = fusionar(l, base({ cantidad: 2 }));
    expect(l).toHaveLength(1);
    expect(l[0]!.cantidad).toBe(3);
  });

  it('el orden de los modificadores no importa', () => {
    expect(claveLinea('p', ['a', 'b'], '')).toBe(claveLinea('p', ['b', 'a'], ''));
    const l = fusionar(
      fusionar([], base({ modificadores: ['a', 'b'] })),
      base({ modificadores: ['b', 'a'] }),
    );
    expect(l).toHaveLength(1);
  });

  it('otra nota u otros modificadores → línea aparte', () => {
    let l = fusionar([], base());
    l = fusionar(l, base({ nota: 'sin cebolla' }));
    l = fusionar(l, base({ modificadores: ['bien'] }));
    expect(l).toHaveLength(3);
  });

  it('no pasa de 20 unidades', () => {
    const l = fusionar(fusionar([], base({ cantidad: 15 })), base({ cantidad: 10 }));
    expect(l[0]!.cantidad).toBe(20);
  });

  it('editar la nota hasta igualar otra línea las fusiona', () => {
    let l = fusionar([], base({ nota: 'sin cebolla' }));
    l = fusionar(l, base({ cantidad: 2 }));
    l = conNota(l, l[1]!.clave, '  sin cebolla ');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ cantidad: 3, nota: 'sin cebolla' });
  });

  it('al confirmarse el envío solo se quita lo enviado', () => {
    const enviadas = fusionar([], base({ cantidad: 2 }));
    const despues = fusionar(
      fusionar(enviadas, base()),
      base({ platoId: 'cafe', modificadores: [] }),
    );
    const quedan = restar(despues, enviadas);
    expect(quedan.map((x) => [x.platoId, x.cantidad])).toEqual([
      ['casado', 1],
      ['cafe', 1],
    ]);
  });
});

describe('cálculo del carrito', () => {
  const config = { porcentajeIva: 13, porcentajeServicio: 10, preciosIncluyenImpuestos: true };

  it('usa calcularTotales de shared: IVA incluido y servicio sobre la base', () => {
    // 1 casado ₡5 500 + 2 refrescos ₡1 500 = ₡8 500 del menú
    const l = fusionar(
      fusionar([], base()),
      base({ platoId: 'refresco', modificadores: [], precioUnitario: 150000, cantidad: 2 }),
    );
    const t = calcularTotales(l, config);
    expect(t.subtotal + t.montoIva).toBe(850000);
    expect(t.montoServicio).toBe(75221); // 10 % de 752 212 (8 500 / 1,13)
    expect(t.total).toBe(925221);
  });
});
