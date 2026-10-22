import { createContext, useContext, type ReactNode } from 'react';
import type { Idioma } from '@menu-qr/shared';
import { en } from './textos/en';
import { es, type Textos } from './textos/es';

// Idioma y textos para los componentes compartidos. Cada app decide de dónde sale el idioma
// (el comensal lo elige; el personal usa español).
const Ctx = createContext<{ idioma: Idioma; t: Textos }>({ idioma: 'es', t: es });

export function UiProvider({ idioma, children }: { idioma: Idioma; children: ReactNode }) {
  return <Ctx.Provider value={{ idioma, t: idioma === 'en' ? en : es }}>{children}</Ctx.Provider>;
}

export const useUi = () => useContext(Ctx);
export const textosDe = (idioma: Idioma) => (idioma === 'en' ? en : es);
