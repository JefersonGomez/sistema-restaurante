// Tiempo transcurrido para las pantallas de operación: "m:ss" (menos de 1 h), "X h Y min"
// (hasta 24 h) y "X d Y h" (más). Nunca "15784 min".
export function tiempoTranscurrido(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600);
  if (h < 24) return `${h} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}
