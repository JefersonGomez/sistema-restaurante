import QRCode from 'qrcode';
import type { ActualizarMesaInput, MesaInput } from '@menu-qr/shared';
import { env } from '../../lib/env';
import { prisma } from '../../lib/prisma';
import { generarTokenQr } from '../../lib/tokens';
import { noExiste } from '../../middlewares/errorHandler';

export async function obtener(restauranteId: string, id: string) {
  const m = await prisma.mesa.findFirst({ where: { id, restauranteId } });
  if (!m) throw noExiste('Mesa');
  return m;
}

export const listar = (restauranteId: string) =>
  prisma.mesa.findMany({ where: { restauranteId }, orderBy: { numero: 'asc' } });

export const crear = (restauranteId: string, data: MesaInput) =>
  prisma.mesa.create({ data: { ...data, restauranteId, tokenQr: generarTokenQr() } });

export async function actualizar(restauranteId: string, id: string, data: ActualizarMesaInput) {
  await obtener(restauranteId, id);
  return prisma.mesa.update({ where: { id }, data });
}

export async function eliminar(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  await prisma.mesa.delete({ where: { id } });
}

// El QR viejo deja de funcionar.
export async function regenerarToken(restauranteId: string, id: string) {
  await obtener(restauranteId, id);
  return prisma.mesa.update({ where: { id }, data: { tokenQr: generarTokenQr() } });
}

export async function qr(restauranteId: string, id: string, formato: 'png' | 'svg') {
  const { tokenQr } = await obtener(restauranteId, id);
  const url = `${env.MENU_PUBLIC_URL}/m/${tokenQr}`;
  return formato === 'svg'
    ? { tipo: 'image/svg+xml', cuerpo: await QRCode.toString(url, { type: 'svg', margin: 2 }) }
    : {
        tipo: 'image/png',
        cuerpo: await QRCode.toBuffer(url, { type: 'png', margin: 2, width: 512 }),
      };
}
