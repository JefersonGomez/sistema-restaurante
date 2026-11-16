import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from './env';
import { logger } from './logger';

export type Adjunto = { nombre: string; contenido: Buffer };
export type Correo = { para: string; asunto: string; texto: string; adjuntos?: Adjunto[] };

// En tests no sale nada: se guardan aquí para revisarlos.
export const correosEnviados: Correo[] = [];

// Carpeta donde, sin RESEND_API_KEY, se guarda una copia de cada correo con sus adjuntos.
export const CARPETA_CORREOS_DEV = join(tmpdir(), 'kitchago-correos');

// Envía con Resend (API HTTP, sin librería). Sin RESEND_API_KEY (desarrollo) se escribe en la
// consola y se guarda una copia local. Nunca lanza: devuelve si salió y, si no, por qué.
export async function enviarCorreo(c: Correo): Promise<{ enviado: boolean; error?: string }> {
  if (env.NODE_ENV === 'test') {
    correosEnviados.push(c);
    return { enviado: true };
  }
  if (!env.RESEND_API_KEY) {
    const carpeta = await guardarCopia(c).catch(() => null);
    logger.info(
      `[correo sin enviar: falta RESEND_API_KEY] Para: ${c.para} · ${c.asunto}\n${c.texto}` +
        (carpeta ? `\nCopia con adjuntos en: ${carpeta}` : ''),
    );
    return { enviado: false, error: 'Falta configurar el envío de correos (RESEND_API_KEY)' };
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
        ...(c.adjuntos?.length && {
          attachments: c.adjuntos.map((a) => ({
            filename: a.nombre,
            content: a.contenido.toString('base64'),
          })),
        }),
      }),
    });
    if (r.ok) return { enviado: true };
    const detalle = await r.text();
    logger.error(`Resend respondió ${r.status}: ${detalle}`);
    return { enviado: false, error: `El servicio de correo respondió ${r.status}` };
  } catch (e) {
    logger.error('No se pudo enviar el correo', e);
    return { enviado: false, error: 'No se pudo conectar con el servicio de correo' };
  }
}

async function guardarCopia(c: Correo) {
  const carpeta = join(CARPETA_CORREOS_DEV, `${Date.now()}-${c.para.replace(/[^\w.@-]/g, '_')}`);
  await mkdir(carpeta, { recursive: true });
  await writeFile(
    join(carpeta, 'correo.txt'),
    `Para: ${c.para}\nAsunto: ${c.asunto}\n\n${c.texto}`,
  );
  for (const a of c.adjuntos ?? []) await writeFile(join(carpeta, a.nombre), a.contenido);
  return carpeta;
}
