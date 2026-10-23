// Sonido con Web Audio API (sin librerías). Los navegadores exigen un toque del usuario antes de
// poder sonar: por eso las pantallas muestran "Activar sonido" una vez.

let ctx: AudioContext | null = null;

export function activarSonido(probar = true) {
  ctx ??= new AudioContext();
  void ctx.resume().then(() => probar && sonar(1));
}

// Al recargar la página el navegador vuelve a bloquear el audio: el primer toque o tecla en
// cualquier parte lo reactiva solo (sin pitido), sin tener que buscar el botón.
export function activarConPrimerToque() {
  const activar = () => {
    activarSonido(false);
    window.removeEventListener('pointerdown', activar);
    window.removeEventListener('keydown', activar);
  };
  window.addEventListener('pointerdown', activar);
  window.addEventListener('keydown', activar);
}

export const sonidoActivo = () => ctx?.state === 'running';

// Pitido fuerte de `veces` tonos.
export function sonar(veces = 3) {
  if (!ctx || ctx.state !== 'running') return;
  for (let i = 0; i < veces; i++) {
    const inicio = ctx.currentTime + i * 0.35;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    vol.gain.setValueAtTime(0.6, inicio);
    vol.gain.exponentialRampToValueAtTime(0.001, inicio + 0.3);
    osc.connect(vol).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + 0.3);
  }
}

export function vibrar() {
  navigator.vibrate?.([200, 100, 200]);
}
