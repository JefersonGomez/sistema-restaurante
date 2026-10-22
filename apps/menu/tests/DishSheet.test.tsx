import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PlatoPublico } from '@menu-qr/shared';
import { DishSheet, formatoPrecio } from '@menu-qr/ui';
import { useIdioma } from '../src/estado/idioma';

const casadoBistec: PlatoPublico = {
  id: 'casado',
  nombreEs: 'Casado con bistec',
  nombreEn: 'Casado with steak',
  descripcionEs: 'Bistec encebollado',
  descripcionEn: null,
  precio: 550000,
  fotoUrl: null,
  fotoMiniUrl: null,
  agotado: false,
  precioAntes: null,
  alergenos: [],
  grupos: [
    {
      id: 'termino',
      nombreEs: 'Término de la carne',
      nombreEn: 'Doneness',
      obligatorio: true,
      minimo: 1,
      maximo: 1,
      modificadores: [
        { id: 'medio', nombreEs: 'Término medio', nombreEn: 'Medium', precioExtra: 0 },
        { id: 'bien', nombreEs: 'Bien cocido', nombreEn: 'Well done', precioExtra: 0 },
      ],
    },
    {
      id: 'extras',
      nombreEs: 'Extras',
      nombreEn: 'Extras',
      obligatorio: false,
      minimo: 0,
      maximo: 2,
      modificadores: [
        { id: 'huevo', nombreEs: 'Huevo frito', nombreEn: 'Fried egg', precioExtra: 50000 },
        { id: 'aguacate', nombreEs: 'Aguacate', nombreEn: 'Avocado', precioExtra: 60000 },
        { id: 'queso', nombreEs: 'Queso', nombreEn: 'Cheese', precioExtra: 80000 },
      ],
    },
  ],
};

const abrir = (onAgregar = vi.fn(), onCerrar = vi.fn()) => {
  useIdioma.setState({ idioma: 'es' }); // jsdom reporta navigator.language = en-US
  render(
    <DishSheet
      plato={casadoBistec}
      icono="🍛"
      precio={formatoPrecio('CRC')}
      puedePedir
      onAgregar={onAgregar}
      onCerrar={onCerrar}
    />,
  );
  return { onAgregar, onCerrar, user: userEvent.setup() };
};

describe('hoja de detalle: validación de modificadores', () => {
  it('no agrega sin el término obligatorio y muestra "Elija una opción"', async () => {
    const { onAgregar, user } = abrir();
    await user.click(screen.getByRole('button', { name: /Agregar · ₡5\s500/ }));
    expect(onAgregar).not.toHaveBeenCalled();
    expect(screen.getByText('Elija una opción')).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('con el término elegido agrega con modificadores, nota, cantidad y precio en vivo', async () => {
    const { onAgregar, user } = abrir();
    await user.click(screen.getByRole('radio', { name: 'Término medio' }));
    await user.click(screen.getByRole('checkbox', { name: /Huevo frito/ }));
    await user.type(screen.getByLabelText('Nota de preparación'), 'Sin cebolla');
    await user.click(screen.getByRole('button', { name: 'Agregar uno' }));
    // (5 500 + 500) × 2
    await user.click(screen.getByRole('button', { name: /Agregar · ₡12\s000/ }));
    expect(onAgregar).toHaveBeenCalledWith(
      expect.objectContaining({
        platoId: 'casado',
        cantidad: 2,
        nota: 'Sin cebolla',
        modificadores: ['medio', 'huevo'],
        precioUnitario: 600000,
      }),
    );
  });

  it('un grupo de máximo 2 no deja marcar 3 (se suelta el más viejo)', async () => {
    const { user } = abrir();
    for (const nombre of [/Huevo frito/, /Aguacate/, /Queso/])
      await user.click(screen.getByRole('checkbox', { name: nombre }));
    const marcados = screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked);
    expect(marcados).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: /Huevo frito/ })).not.toBeChecked();
  });

  it('se cierra con Escape', async () => {
    const { onCerrar, user } = abrir();
    await user.keyboard('{Escape}');
    expect(onCerrar).toHaveBeenCalled();
  });
});
