// Horario de atención por turnos. Puede haber varios turnos por día, y un turno puede pasar de la
// medianoche (cierra < abre: ej. viernes 18:00–02:00 incluye la madrugada del sábado).
// Sin turnos configurados = siempre abierto (salvo cierre manual). abre = cierra: 24 horas.

export const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Turno = { diaSemana: number; abre: string; cierra: string }; // 0 = domingo

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

// Día de la semana y minuto del día en la zona horaria del restaurante.
export function momentoLocal(ahora: Date, zonaHoraria: string) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const valor = (t: string) => partes.find((p) => p.type === t)!.value;
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(valor('weekday'));
  return { diaSemana: dia, minuto: Number(valor('hour')) * 60 + Number(valor('minute')) };
}

export function zonaHorariaValida(zona: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

export function estaAbierto(
  turnos: Turno[],
  ahora: Date,
  zonaHoraria: string,
  cerradoManual = false,
): boolean {
  if (cerradoManual) return false;
  if (turnos.length === 0) return true;
  const { diaSemana, minuto } = momentoLocal(ahora, zonaHoraria);
  const ayer = (diaSemana + 6) % 7;
  return turnos.some((t) => {
    const a = minutos(t.abre);
    const c = minutos(t.cierra);
    if (a === c) return t.diaSemana === diaSemana; // 24 horas
    if (a < c) return t.diaSemana === diaSemana && minuto >= a && minuto < c;
    // Cruza medianoche: la parte de la noche es de su día; la madrugada, del día siguiente.
    return (t.diaSemana === diaSemana && minuto >= a) || (t.diaSemana === ayer && minuto < c);
  });
}

// Turnos de hoy (en la zona del restaurante), ordenados, para mostrar "Abierto · 7:00–21:00".
export function turnosDeHoy(turnos: Turno[], ahora: Date, zonaHoraria: string) {
  const { diaSemana } = momentoLocal(ahora, zonaHoraria);
  return turnos
    .filter((t) => t.diaSemana === diaSemana)
    .map(({ abre, cierra }) => ({ abre, cierra }))
    .sort((x, y) => x.abre.localeCompare(y.abre));
}

// "AAAA-MM-DD" de hoy en la zona del restaurante.
export const fechaLocal = (ahora: Date, zonaHoraria: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria }).format(ahora);

// Un menú del día se ofrece hoy si está programado para este día de la semana o, a mano, para la
// fecha de hoy ("AAAA-MM-DD").
export function menuDelDiaHoy(
  p: { diasSemana: number[]; fechaMenu: string | null },
  ahora: Date,
  zonaHoraria: string,
) {
  return (
    p.diasSemana.includes(momentoLocal(ahora, zonaHoraria).diaSemana) ||
    p.fechaMenu === fechaLocal(ahora, zonaHoraria)
  );
}
