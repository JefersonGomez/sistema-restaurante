// Horario de atención en hora de Costa Rica (UTC−6 todo el año, sin horario de verano).
// "HH:MM" en 24 h. Sin horario configurado = siempre abierto. Si el cierre es antes que la
// apertura, el horario cruza la medianoche (ej. 18:00–02:00). Apertura = cierre: 24 horas.

export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

export function minutoDelDiaCR(ahora: Date) {
  const cr = new Date(ahora.getTime() - 6 * 60 * 60 * 1000);
  return cr.getUTCHours() * 60 + cr.getUTCMinutes();
}

export function estaAbierto(apertura: string | null, cierre: string | null, ahora = new Date()) {
  if (!apertura || !cierre) return true;
  const a = minutos(apertura);
  const c = minutos(cierre);
  const m = minutoDelDiaCR(ahora);
  if (a === c) return true;
  return a < c ? m >= a && m < c : m >= a || m < c;
}
