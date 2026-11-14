# Fase 14 — Arqueo de caja (abrir y cerrar caja)

Pedido del usuario (2026-11-13): "ok sigue con lo de arqueo" (del backlog: apertura y arqueo de caja
con fondo inicial, propuesto al cerrar la Fase 13).

## Qué hace

Un **turno de caja** por restaurante (una sola gaveta):

1. **Abrir caja:** quien abre anota el **fondo inicial** (el sencillo con que empieza la gaveta).
2. **Durante el turno:** se pueden anotar **entradas y salidas de efectivo** que no son ventas, con
   motivo (p. ej. "pago al del gas", "retiro para el banco", "cambio que trajo el dueño").
3. **Cerrar caja:** se **cuenta el efectivo** (con ayuda opcional por billetes y monedas de Costa
   Rica) y el sistema muestra:
   - **Efectivo esperado** = fondo + ventas en efectivo del turno + entradas − salidas.
   - **Diferencia** (sobrante o faltante) contra lo contado.
   - Totales de **tarjeta** y **SINPE** del turno, para cuadrar con el cierre del datáfono y los
     comprobantes.
   - Nota opcional. Se imprime el **cierre** en el ticket de 80 mm.
4. **Historial:** el dueño ve los cierres (fecha, quién, esperado, contado, diferencia) en Reportes.

Qué cuenta como venta del turno (entre la apertura y el cierre):

- Cuentas cerradas en el turno, repartidas por método con el detalle del cobro (Fase 13); sin
  detalle, en su método.
- **Domicilio pagado en efectivo:** cuenta cuando la caja recibe el efectivo del repartidor
  (botón "Recibido"), no cuando se entregó el pedido.

## Decisiones tomadas por defecto (revisables)

- **Cobrar sin caja abierta sigue permitido** (no se bloquea a quien no use el arqueo); la caja
  muestra un aviso para abrirla.
- Una sola caja abierta a la vez por restaurante. Pueden abrir, mover y cerrar: CAJA y DUEÑO.
- Se guarda solo el total contado (el desglose por billetes es una ayuda en pantalla).
- El cierre queda fijo: si después se deshace o cambia algo, no altera un cierre ya hecho.

## Fuera de alcance

Varias cajas o gavetas en el mismo local, cierre ciego (sin mostrar el esperado), integración con el
datáfono, depósitos bancarios, factura electrónica.

## Plan

1. **14.1** Modelo `TurnoCaja` + `MovimientoCaja`, `efectivoRecibidoEn` en Cuenta, API con tests.
2. **14.2** Caja: abrir, entradas/salidas, cerrar con conteo, ticket del cierre.
3. **14.3** Historial de cierres en Reportes (dueño).
