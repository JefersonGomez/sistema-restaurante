import { env } from '../../lib/env';
import type { Identificacion } from './xml';

// El usuario de la API de Hacienda trae la cédula: "cpf-01-2345-6789" → física 123456789;
// "cpj-3-101-123456" → jurídica 3101123456.
export function identificacionDeUsuario(usuario: string): Identificacion {
  const [prefijo, ...resto] = usuario.split('@')[0]!.split('-');
  const numero = resto.join('');
  if (prefijo === 'cpf') return { tipo: '01', numero: numero.replace(/^0(?=\d{9}$)/, '') };
  if (prefijo === 'cpj') return { tipo: '02', numero };
  throw new Error('No se reconoce la identificación en el usuario de Hacienda');
}

// Cédula de KitchaGo como proveedor de sistemas (va en cada comprobante).
export function proveedorSistemas() {
  if (env.HACIENDA_PROVEEDOR_ID) return env.HACIENDA_PROVEEDOR_ID.replace(/\D/g, '');
  if (env.HACIENDA_USER) return identificacionDeUsuario(env.HACIENDA_USER).numero;
  throw new Error('Falta HACIENDA_PROVEEDOR_ID (cédula del proveedor de sistemas)');
}
