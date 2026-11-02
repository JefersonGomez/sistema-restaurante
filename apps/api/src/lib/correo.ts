import { env } from './env';
import { logger } from './logger';

export type Correo = { para: string; asunto: string; texto: string };

// En tests no sale nada: se guardan aquí para revisarlos.
export const correosEnviados: Correo[] = [];

// Envía con Resend (API HTTP, sin librería). Sin RESEND_API_KEY (desarrollo) se escribe en la
// consola. Si Resend falla se registra el error y no se corta la petición del usuario.
export async function enviarCorreo(c: Correo) {
  if (env.NODE_ENV === 'test') {
    correosEnviados.push(c);
    return;
  }
  if (!env.RESEND_API_KEY) {
    logger.info(
      `[correo sin enviar: falta RESEND_API_KEY] Para: ${c.para} · ${c.asunto}\n${c.texto}`,
    );
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CORREO_REMITENTE,
        to: [c.para],
        subject: c.asunto,
        text: c.texto,
      }),
    });
    if (!r.ok) logger.error(`Resend respondió ${r.status}: ${await r.text()}`);
  } catch (e) {
    logger.error('No se pudo enviar el correo', e);
  }
}
