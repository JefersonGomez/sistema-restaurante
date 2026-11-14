import type { ResultadoCabys } from '@menu-qr/shared';
import { HttpError } from '../../middlewares/errorHandler';

// Catálogo CABYS de Hacienda (API pública, sin credenciales). Se consulta desde la API para no
// depender de CORS en el navegador.
const URL_CABYS = 'https://api.hacienda.go.cr/fe/cabys';

type RespuestaHacienda = {
  cabys?: { codigo: string; descripcion: string; impuesto: number }[];
};

export async function buscarCabys(q: string): Promise<ResultadoCabys[]> {
  let datos: RespuestaHacienda;
  try {
    const r = await fetch(`${URL_CABYS}?q=${encodeURIComponent(q)}&top=20`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(String(r.status));
    datos = (await r.json()) as RespuestaHacienda;
  } catch {
    throw new HttpError(
      502,
      'CABYS_NO_DISPONIBLE',
      'No se pudo consultar el catálogo CABYS de Hacienda. Intente de nuevo.',
    );
  }
  return (datos.cabys ?? []).map((c) => ({
    codigo: c.codigo,
    descripcion: c.descripcion,
    impuesto: c.impuesto,
  }));
}
