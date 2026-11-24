// Sonido con Web Audio API (sin librerías). Los navegadores exigen un toque del usuario antes de
// poder sonar: el primer toque o tecla en cualquier parte lo activa solo (Fase 20.2).

let ctx: AudioContext | null = null;

// Cada equipo elige su sonido: suave (por defecto), campana (cocinas ruidosas) o sin sonido.
export type TipoSonido = 'suave' | 'campana' | 'apagado';
export const SONIDOS: { id: TipoSonido; texto: string }[] = [
  { id: 'suave', texto: 'Suave' },
  { id: 'campana', texto: 'Campana (más fuerte)' },
  { id: 'apagado', texto: 'Sin sonido' },
];
const CLAVE = 'kitchago:sonido';
export function tipoSonido(): TipoSonido {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'campana' || t === 'apagado' ? t : 'suave';
  } catch {
    return 'suave';
  }
}
export function elegirSonido(t: TipoSonido) {
  try {
    localStorage.setItem(CLAVE, t);
  } catch {
    // sin almacenamiento: queda el suave
  }
  activarSonido(false);
  sonar(1);
}

export function activarSonido(probar = true) {
  ctx ??= new AudioContext();
  void ctx.resume().then(() => probar && sonar(1));
}

export function activarConPrimerToque() {
  const activar = () => {
    activarSonido(false);
    window.removeEventListener('pointerdown', activar);
    window.removeEventListener('keydown', activar);
  };
  window.addEventListener('pointerdown', activar);
  window.addEventListener('keydown', activar);
}

// Una nota con caída suave (sin el tono cuadrado de antes, que era el "tin tin" molesto).
function nota(
  frecuencia: number,
  inicio: number,
  duracion: number,
  volumen: number,
  forma: OscillatorType,
) {
  const osc = ctx!.createOscillator();
  const vol = ctx!.createGain();
  osc.type = forma;
  osc.frequency.value = frecuencia;
  vol.gain.setValueAtTime(0.0001, inicio);
  vol.gain.exponentialRampToValueAtTime(volumen, inicio + 0.02);
  vol.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  osc.connect(vol).connect(ctx!.destination);
  osc.start(inicio);
  osc.stop(inicio + duracion);
}

// `urgente` (llamadas, pedidos nuevos para cocina): la campana suena dos veces; el suave, una.
export function sonar(urgente: number | boolean = false) {
  const tipo = tipoSonido();
  if (tipo === 'apagado' || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (tipo === 'suave') {
    // Dos notas cortas y bajas, como un "ding-dong" discreto.
    nota(659, t, 0.35, 0.12, 'sine');
    nota(880, t + 0.16, 0.5, 0.1, 'sine');
    return;
  }
  const veces = urgente === true || (typeof urgente === 'number' && urgente > 2) ? 2 : 1;
  for (let i = 0; i < veces; i++) {
    nota(1319, t + i * 0.6, 0.9, 0.3, 'triangle');
    nota(1976, t + i * 0.6, 0.6, 0.08, 'sine');
  }
}

export function vibrar() {
  navigator.vibrate?.([150, 80, 150]);
}
