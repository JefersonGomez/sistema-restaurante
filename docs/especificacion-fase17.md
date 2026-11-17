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

## Plan

1. **17.1** Servicio a repartir en Reportes (API + pantalla + tests).
