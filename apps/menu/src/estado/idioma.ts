import { create } from 'zustand';
import type { Idioma } from '@menu-qr/shared';
import { guardar, leer } from '../almacen';
import { textosDe } from '@menu-qr/ui';

const CLAVE = 'menu-idioma';

function inicial(): Idioma {
  const guardado = leer<Idioma>(CLAVE);
  if (guardado === 'es' || guardado === 'en') return guardado;
  return navigator.language?.startsWith('en') ? 'en' : 'es';
}

export const useIdioma = create<{ idioma: Idioma; alternar: () => void }>((set, get) => ({
  idioma: inicial(),
  alternar: () => {
    const idioma = get().idioma === 'es' ? 'en' : 'es';
    guardar(CLAVE, idioma);
    document.documentElement.lang = idioma;
    set({ idioma });
  },
}));

export const useTextos = () => textosDe(useIdioma((s) => s.idioma));
