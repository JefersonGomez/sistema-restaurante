// Cálculo de la cuenta. Todo en céntimos (enteros); nunca floats.
//
// Redondeo: "mitad hacia arriba" al céntimo, aplicado una sola vez por concepto sobre la suma
// de cada tarifa de IVA (no por línea), para que el desglose no acumule errores.
// El servicio se calcula siempre sobre la base sin IVA, y el IVA no se cobra sobre el servicio.
// Cada línea puede traer su tarifa de IVA (Fase 13); sin tarifa usa la del restaurante. Las
// líneas se agrupan por tarifa, se calcula cada grupo con las fórmulas de abajo y se suman.
//
// preciosIncluyenImpuestos = false (precios de menú sin impuestos):
//   subtotal      = Σ precioUnitario × cantidad
//   montoServicio = redondear(subtotal × servicio%)
//   montoIva      = redondear(subtotal × IVA%)
//   total         = subtotal + montoServicio + montoIva
//
// preciosIncluyenImpuestos = true (el precio del menú ya trae el IVA; el servicio se suma aparte):
//   bruto         = Σ precioUnitario × cantidad        (lo que dice el menú)
//   subtotal      = redondear(bruto × 100 / (100 + IVA%))   (base sin IVA)
//   montoIva      = bruto − subtotal                   (exacto: el IVA que ya traía el menú)
//   montoServicio = redondear(subtotal × servicio%)
//   total         = bruto + montoServicio
//   Ej.: ₡4 800 → base ₡4 247,79 · IVA ₡552,21 · servicio ₡424,78 · total ₡5 224,78
//
// En ambos casos subtotal + montoServicio + montoIva = total. Los ítems cancelados no suman.

export type LineaCuenta = {
  precioUnitario: number;
  cantidad: number;
  cancelado?: boolean;
  tarifaIva?: number | null; // % de IVA del plato; null = el del restaurante
};

export type ConfigImpuestos = {
  porcentajeIva: number;
  porcentajeServicio: number;
  preciosIncluyenImpuestos: boolean;
};

export type Totales = { subtotal: number; montoServicio: number; montoIva: number; total: number };

// round(n / d) mitad hacia arriba, solo con enteros (n ≥ 0, d > 0).
const dividirRedondeando = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));

function totalesDe(bruto: number, iva: number, config: ConfigImpuestos): Totales {
  const servicio = config.porcentajeServicio;
  if (!config.preciosIncluyenImpuestos) {
    const montoServicio = dividirRedondeando(bruto * servicio, 100);
    const montoIva = dividirRedondeando(bruto * iva, 100);
    return { subtotal: bruto, montoServicio, montoIva, total: bruto + montoServicio + montoIva };
  }
  const subtotal = dividirRedondeando(bruto * 100, 100 + iva);
  const montoServicio = dividirRedondeando(subtotal * servicio, 100);
  return { subtotal, montoServicio, montoIva: bruto - subtotal, total: bruto + montoServicio };
}

export function calcularTotales(lineas: LineaCuenta[], config: ConfigImpuestos): Totales {
  for (const l of lineas)
    if (!Number.isSafeInteger(l.precioUnitario) || !Number.isSafeInteger(l.cantidad))
      throw new Error('Montos y cantidades deben ser enteros');

  // Bruto por tarifa de IVA.
  const porTarifa = new Map<number, number>([[config.porcentajeIva, 0]]);
  for (const l of lineas) {
    if (l.cancelado) continue;
    const tarifa = l.tarifaIva ?? config.porcentajeIva;
    porTarifa.set(tarifa, (porTarifa.get(tarifa) ?? 0) + l.precioUnitario * l.cantidad);
  }
  const suma: Totales = { subtotal: 0, montoServicio: 0, montoIva: 0, total: 0 };
  for (const [tarifa, bruto] of porTarifa) {
    const t = totalesDe(bruto, tarifa, config);
    suma.subtotal += t.subtotal;
    suma.montoServicio += t.montoServicio;
    suma.montoIva += t.montoIva;
    suma.total += t.total;
  }
  return suma;
}
