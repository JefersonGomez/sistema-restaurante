# Fase 17 — Mejoras sin despliegue

Pedido del usuario (2026-11-16): "sigue con lo que no conlleva el despliegue". El despliegue en el
VPS queda para después (faltan los datos del VPS y el dominio).

## 17.1 Reporte "Servicio a repartir"

Origen: información que trajo el usuario sobre la Ley 9116: el 10 % de servicio es de los saloneros,
sin rebajos; con efectivo se les liquida en una semana y con tarjeta en un mes (a confirmar con el
contador).

- En Reportes (dueño), para el rango elegido: **total de servicio cobrado**, separado **por método
  de pago** (efectivo, tarjeta, SINPE) y **por día**, con el plazo para entregarlo según el método.
- Cómo se reparte entre métodos: con el detalle del cobro (Fase 13) el servicio de una cuenta mixta
  se divide en proporción a lo que se pagó con cada método; sin detalle, va al método de la cuenta
  o del grupo. Montos enteros (el redondeo queda en la parte más grande).
- Solo cuentas de mesa traen servicio (en línea y para llevar no lo cobran).
- El reparto entre saloneros (quién atendió cada mesa) queda fuera: el reporte da el monto total.

## 17.2 Notas de crédito parciales

Pedido del usuario (2026-11-16): "súbelo y sigue con las notas de crédito parciales".

- En un tiquete o factura **aceptado**, además de "Anular" (todo), opción **"Devolución parcial"**:
  se eligen los platos y cuántas unidades se acreditan, el tipo y el motivo.
- Tipo (código de referencia v4.4): **06 "Devolución de mercancía"** (el cliente devolvió algo) o
  **14 "Corrige monto por error material"** (se cobró de más). La anulación total sigue con 01.
- La nota lleva solo esas líneas, con su IVA y la parte proporcional del 10 % de servicio si el
  cobro lo tenía (el envío no se acredita). Mismo cliente que el original.
- No se puede acreditar más de lo que queda: cada línea descuenta lo ya acreditado en notas
  anteriores que no fallaron. Con notas parciales ya emitidas, la anulación total se bloquea (se
  usa devolución parcial para lo que queda); un comprobante anulado no admite parciales.
- Solo afecta lo fiscal (la venta sigue en los reportes), igual que la anulación total.

## Plan

1. **17.1** Servicio a repartir en Reportes (API + pantalla + tests). ✅
2. **17.2** Notas de crédito parciales. ✅ (06 y 14 aceptadas por Hacienda en pruebas)
