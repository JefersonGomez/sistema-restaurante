// Cliente de la API de recepción de comprobantes de Hacienda (token OAuth + envío + consulta).

export type Ambiente = 'pruebas' | 'produccion';
const URLS: Record<Ambiente, { token: string; cliente: string; recepcion: string }> = {
  pruebas: {
    token:
      'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token',
    cliente: 'api-stag',
    recepcion: 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/recepcion/',
  },
  produccion: {
    token:
      'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token',
    cliente: 'api-prod',
    recepcion: 'https://api.comprobanteselectronicos.go.cr/recepcion/v1/recepcion/',
  },
};

export type Credenciales = { ambiente: Ambiente; usuario: string; clave: string };
export class ErrorHacienda extends Error {
  constructor(
    message: string,
    readonly estado?: number,
    readonly detalle?: string,
  ) {
    super(message);
  }
}

const TIEMPO = 20_000;
// Token en memoria por usuario (dura ~5 min; se renueva un poco antes).
const tokens = new Map<string, { valor: string; vence: number }>();

export async function token(c: Credenciales) {
  const llave = `${c.ambiente}:${c.usuario}`;
  const guardado = tokens.get(llave);
  if (guardado && guardado.vence > Date.now()) return guardado.valor;
  const u = URLS[c.ambiente];
  const r = await fetch(u.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: u.cliente,
      username: c.usuario,
      password: c.clave,
    }),
    signal: AbortSignal.timeout(TIEMPO),
  });
  if (!r.ok)
    throw new ErrorHacienda(
      r.status === 401 || r.status === 400
        ? 'Hacienda rechazó el usuario o la clave de la API'
        : `Hacienda no dio el token (${r.status})`,
      r.status,
      await r.text().catch(() => ''),
    );
  const datos = (await r.json()) as { access_token: string; expires_in: number };
  tokens.set(llave, {
    valor: datos.access_token,
    vence: Date.now() + (datos.expires_in - 30) * 1000,
  });
  return datos.access_token;
}

export type Envio = {
  clave: string;
  fecha: string;
  emisor: { tipo: string; numero: string };
  receptor?: { tipo: string; numero: string };
  xmlFirmado: string;
};

// Hacienda responde 202 si lo recibió; el resultado (aceptado/rechazado) se consulta después.
export async function enviar(c: Credenciales, e: Envio) {
  const r = await fetch(URLS[c.ambiente].recepcion, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token(c)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clave: e.clave,
      fecha: e.fecha,
      emisor: { tipoIdentificacion: e.emisor.tipo, numeroIdentificacion: e.emisor.numero },
      ...(e.receptor && {
        receptor: { tipoIdentificacion: e.receptor.tipo, numeroIdentificacion: e.receptor.numero },
      }),
      comprobanteXml: Buffer.from(e.xmlFirmado, 'utf8').toString('base64'),
    }),
    signal: AbortSignal.timeout(TIEMPO),
  });
  if (r.status === 202 || r.status === 201 || r.status === 200) return;
  throw new ErrorHacienda(
    `Hacienda no recibió el comprobante (${r.status})`,
    r.status,
    r.headers.get('x-error-cause') ?? (await r.text().catch(() => '')),
  );
}

export type Estado = {
  estado: 'recibido' | 'procesando' | 'aceptado' | 'rechazado' | 'error' | string;
  mensaje?: string; // detalle de la respuesta de Hacienda
  respuestaXml?: string;
};

export async function consultar(c: Credenciales, clave: string): Promise<Estado> {
  const r = await fetch(URLS[c.ambiente].recepcion + clave, {
    headers: { Authorization: `Bearer ${await token(c)}` },
    signal: AbortSignal.timeout(TIEMPO),
  });
  if (r.status === 404) return { estado: 'no-encontrado' };
  if (!r.ok)
    throw new ErrorHacienda(
      `No se pudo consultar el comprobante (${r.status})`,
      r.status,
      r.headers.get('x-error-cause') ?? '',
    );
  const datos = (await r.json()) as { 'ind-estado': string; 'respuesta-xml'?: string };
  const respuestaXml = datos['respuesta-xml']
    ? Buffer.from(datos['respuesta-xml'], 'base64').toString('utf8')
    : undefined;
  const mensaje = respuestaXml?.match(/<DetalleMensaje>([\s\S]*?)<\/DetalleMensaje>/)?.[1]?.trim();
  return { estado: datos['ind-estado'], mensaje, respuestaXml };
}
