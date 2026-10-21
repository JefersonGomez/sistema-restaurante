import { create } from 'zustand';

let temporizador: ReturnType<typeof setTimeout> | undefined;

// Un aviso (toast) a la vez; desaparece solo.
export const useAvisos = create<{
  texto: string | null;
  id: number;
  avisar: (texto: string) => void;
}>((set, get) => ({
  texto: null,
  id: 0,
  avisar: (texto) => {
    clearTimeout(temporizador);
    set({ texto, id: get().id + 1 });
    temporizador = setTimeout(() => set({ texto: null }), 2600);
  },
}));

export const avisar = (texto: string) => useAvisos.getState().avisar(texto);
