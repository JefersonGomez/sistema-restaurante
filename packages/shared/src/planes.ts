// Planes de la mensualidad (Fase 9). Montos en céntimos de colón.
export type PlanId = 'BASICO' | 'COMPLETO';

export const PLANES: Record<PlanId, { nombre: string; mensual: number; incluye: string }> = {
  BASICO: {
    nombre: 'Básico',
    mensual: 990_000,
    incluye: 'Menú con QR, pedidos en mesa, cocina, caja y reportes',
  },
  COMPLETO: {
    nombre: 'Completo',
    mensual: 1_990_000,
    incluye: 'Todo el Básico más pedidos en línea, domicilio, repartidores, clientes y sellos',
  },
};

export const DIAS_PRUEBA = 30;
// Aviso "por vencer" 2 días antes; vencido, 1 día de gracia y luego se suspende solo (Fase 11).
export const DIAS_POR_VENCER = 2;
export const DIAS_GRACIA = 1;
export const suspensionDe = (venceEn: Date | string) =>
  new Date(new Date(venceEn).getTime() + DIAS_GRACIA * 86_400_000);

// Cada 12 meses se cobran 10 (anual con 2 meses gratis).
export const montoSugerido = (plan: PlanId, meses: number) =>
  PLANES[plan].mensual * (Math.floor(meses / 12) * 10 + (meses % 12));

// Pedidos en línea, repartidores, clientes y sellos son del plan Completo.
export const incluyeEnLinea = (plan: PlanId) => plan === 'COMPLETO';

export type EstadoSuscripcion = 'SUSPENDIDO' | 'PRUEBA' | 'AL_DIA' | 'POR_VENCER' | 'VENCIDO';

export function estadoSuscripcion(
  r: { activo: boolean; planVenceEn: Date | string | null; pagos: number },
  ahora = new Date(),
): EstadoSuscripcion {
  if (!r.activo) return 'SUSPENDIDO';
  if (!r.planVenceEn) return 'VENCIDO';
  const dias = (new Date(r.planVenceEn).getTime() - ahora.getTime()) / 86_400_000;
  if (dias < 0) return 'VENCIDO';
  if (r.pagos === 0) return 'PRUEBA';
  return dias <= DIAS_POR_VENCER ? 'POR_VENCER' : 'AL_DIA';
}

// Vencimiento nuevo al pagar: se suman los meses desde hoy o desde el vencimiento actual (el mayor).
export function nuevoVencimiento(actual: Date | null, meses: number, ahora = new Date()) {
  const base = new Date(Math.max(ahora.getTime(), actual?.getTime() ?? 0));
  base.setMonth(base.getMonth() + meses);
  return base;
}
