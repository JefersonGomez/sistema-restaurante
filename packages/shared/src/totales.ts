// Cálculo de la cuenta. Todo en céntimos (enteros); nunca floats.
//
// Redondeo: "mitad hacia arriba" al céntimo, aplicado una sola vez por concepto sobre la suma
// de la cuenta (no por línea), para que el desglose no acumule errores.
//
// preciosIncluyenImpuestos = false (precios de menú sin impuestos):
//   subtotal      = Σ precioUnitario × cantidad
//   montoServicio = redondear(subtotal × servicio%)
//   montoIva      = redondear(subtotal × IVA%)          (el IVA no se cobra sobre el servicio)
//   total         = subtotal + montoServicio + montoIva
//
// preciosIncluyenImpuestos = true (el precio del menú ya trae IVA y servicio; es lo que paga el
// cliente):
//   total         = Σ precioUnitario × cantidad
//   subtotal      = redondear(total × 100 / (100 + IVA% + servicio%))
//   montoServicio = redondear(subtotal × servicio%)
//   montoIva      = total − subtotal − montoServicio      (absorbe el céntimo de redondeo para que
//                                                          el total sea exactamente el del menú)
//
// Los ítems cancelados no suman.

export type LineaCuenta = { precioUnitario: number; cantidad: number; cancelado?: boolean };

export type ConfigImpuestos = {
  porcentajeIva: number;
  porcentajeServicio: number;
  preciosIncluyenImpuestos: boolean;
};

export type Totales = { subtotal: number; montoServicio: number; montoIva: number; total: number };

// round(n / d) mitad hacia arriba, solo con enteros (n ≥ 0, d > 0).
const dividirRedondeando = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));

export function calcularTotales(lineas: LineaCuenta[], config: ConfigImpuestos): Totales {
  for (const l of lineas)
    if (!Number.isSafeInteger(l.precioUnitario) || !Number.isSafeInteger(l.cantidad))
      throw new Error('Montos y cantidades deben ser enteros');

  const bruto = lineas
    .filter((l) => !l.cancelado)
    .reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const iva = config.porcentajeIva;
  const servicio = config.porcentajeServicio;

  if (!config.preciosIncluyenImpuestos) {
    const montoServicio = dividirRedondeando(bruto * servicio, 100);
    const montoIva = dividirRedondeando(bruto * iva, 100);
    return { subtotal: bruto, montoServicio, montoIva, total: bruto + montoServicio + montoIva };
  }

  const subtotal = dividirRedondeando(bruto * 100, 100 + iva + servicio);
  const montoServicio = dividirRedondeando(subtotal * servicio, 100);
  return { subtotal, montoServicio, montoIva: bruto - subtotal - montoServicio, total: bruto };
}
