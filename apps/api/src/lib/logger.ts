// ponytail: console basta en Fase 1; cambiar por un logger estructurado al desplegar.
export const logger = {
  info: (...args: unknown[]) => console.log(new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error(new Date().toISOString(), ...args),
};
