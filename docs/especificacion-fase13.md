# Fase 13 — Datos del pago en caja

Pedido del usuario (2026-11-13): "que tenga la funcionalidad de ponerle los datos, como cuánto me
dio o cuánto pagó por tarjeta". Aprobado: "sí, arranca con los datos del pago".

Hoy la caja solo guarda el método (efectivo, tarjeta, SINPE o mixto). Se agrega el detalle de cada
cobro para cuadrar la caja al final del día.

## Qué se registra

Cada cobro (cuenta completa o grupo de una cuenta separada) lleva una o varias **líneas de cobro**:

- **Efectivo:** monto y cuánto entregó el cliente (opcional); el sistema calcula el **vuelto**.
  Botones rápidos: monto exacto, ₡5 000, ₡10 000, ₡20 000.
- **Tarjeta:** monto, últimos 4 dígitos y número de autorización del datáfono (opcionales).
- **SINPE Móvil:** monto y número de comprobante (opcional).
- **Mixto:** varias líneas (p. ej. ₡5 000 en efectivo + el resto con tarjeta). No se puede cobrar
  hasta que la suma de las líneas sea igual al total.

Reglas en el servidor:

- La suma de las líneas debe ser exactamente el total cobrado.
- El método del cobro sale de las líneas: un solo método → ese método; varios → MIXTO. "Mixto"
  exige líneas.
- Lo entregado en efectivo no puede ser menor que el monto en efectivo.
- Las líneas son opcionales en la API (compatibilidad); la caja siempre las manda.

## Dónde se ve

- Caja: al cobrar, panel de líneas con el vuelto en grande. En "Ya cobrado" se ve el detalle.
- Ticket impreso: "Efectivo ₡10 000 · Vuelto ₡847", "Tarjeta ····1234 · Aut. 123456",
  "SINPE · Comp. 12345".
- Reportes ("Por método de pago"): una cuenta mixta suma cada parte en su método; así el efectivo
  del día es lo que debe haber en la gaveta.

## CABYS e IVA por plato (pedido 2026-11-13)

Pedido del usuario: "sí, adelanta lo del CABYS y el IVA por plato" (preparación para la factura
electrónica, sin emitir nada todavía).

- Cada plato puede tener su **código CABYS** (13 dígitos) y su **tarifa de IVA** (13 %, 4 %, 2 %,
  1 % o 0 %/exento). Sin tarifa propia usa la del restaurante.
- En el editor del plato: buscador del catálogo CABYS de Hacienda (API pública
  `api.hacienda.go.cr/fe/cabys`, consultada desde nuestra API); al elegir un código se sugiere su
  tarifa.
- La tarifa se copia al ítem al pedir (como el precio) y los totales calculan el IVA por tarifa;
  si todos los platos usan la del restaurante, el resultado es igual al de antes.

Ajuste (pedido 2026-11-13, "listo, entonces sigue"): en Costa Rica normalmente no se usa un CABYS
por platillo sino uno general según la modalidad del local. Por eso:

- **Código CABYS general del restaurante** en Ajustes, con opciones rápidas: con mesero
  (6331000000000), sin mesero con mesas (6332000000000), mostrador sin mesas (6339900000000), o
  buscar otro.
- El CABYS del plato queda **solo para excepciones** (productos que se venden aparte, como café en
  grano o pan empacado), con la nota "Déjelo vacío para usar el código general del restaurante".
- Al facturar: código del plato si tiene; si no, el general.

## Fuera de alcance

Factura electrónica (fase propia, pendiente de investigar actividad económica y temas legales;
el usuario ya tiene acceso al ambiente de pruebas de Hacienda), apertura y arqueo de caja con
fondo inicial, datáfono integrado, detalle del pago en los pedidos en línea (siguen igual).

## Plan

1. **13.1** Modelo `LineaCobro`, esquemas Zod y API (cerrar cuenta y cobrar grupo) con tests.
2. **13.2** Caja: panel de líneas, vuelto, ticket y detalle en "Ya cobrado".
3. **13.3** Reportes por método usando las líneas.
4. **13.4** CABYS y tarifa de IVA por plato, buscador CABYS y totales por tarifa.
5. **13.5** CABYS general del restaurante en Ajustes; el del plato como excepción.
