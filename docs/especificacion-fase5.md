# Fase 5 — Pedidos en línea (para recoger y a domicilio)

Fuente de verdad del alcance de la Fase 5. Decisiones del usuario (2026-10-23): pedidos en línea
**para recoger y a domicilio**; pago **en efectivo al recibir** o **SINPE Móvil verificado a mano**
por el restaurante (sin pasarela de pago). Las comandas siguen siendo digitales.

## Cliente (sin mesa)

- Menú público del restaurante en `/r/:slug` con el mismo diseño, buscador, categorías, promoción,
  menús del día y carrito que el menú de mesa (sin "Llamar al mesero").
- Al pagar el carrito: tipo de pedido (para recoger / a domicilio, según lo que el restaurante
  tenga activo), nombre, teléfono, dirección y referencia (solo a domicilio), forma de pago
  (efectivo o SINPE Móvil) y una nota opcional.
- Con SINPE se muestra el número y el nombre del restaurante y el monto; el cliente puede anotar el
  número de comprobante. El restaurante verifica el pago a mano.
- Totales: los mismos precios e IVA del menú; **sin el 10 % de servicio** (es servicio a la mesa);
  a domicilio se suma el costo de envío. Pedido mínimo opcional.
- Fuera del horario o con el restaurante cerrado no se puede pedir (igual que en mesa).
- Después de pedir, el cliente ve una página de **seguimiento** (`/seguimiento/:token`) con el
  estado: recibido → aceptado (con tiempo estimado) → en preparación → listo → en camino
  (domicilio) → entregado; o rechazado con el motivo. Se actualiza sola.

## Restaurante

- **Ajustes → Pedidos en línea:** activar/desactivar, para recoger, a domicilio, costo de envío,
  pedido mínimo, zona de entrega (texto), número y nombre de SINPE Móvil, tiempo estimado por
  defecto. El enlace para compartir (`/r/:slug`) y su QR para descargar.
- **Pantalla "En línea"** (dueño, caja y mesero): pedidos nuevos con sonido y aviso en la
  campanita; **aceptar** (con tiempo estimado) o **rechazar** (con motivo). Al aceptar, el pedido va
  a cocina como cualquier otro. Después: "Listo para entregar", "Salió a entregar" (domicilio),
  "Entregado y cobrado" (con el método de pago). SINPE: "Pago verificado".
- Cocina, bar y caja muestran estos pedidos con su etiqueta ("Para llevar · Ana",
  "Domicilio · Ana") en lugar del número de mesa.
- Reportes: ventas por canal (mesa, para recoger, a domicilio).

## Seguridad y abuso

- Rutas públicas con límite por IP y por teléfono (pedidos pendientes simultáneos).
- El restaurante siempre acepta o rechaza a mano (no entra a cocina sin aceptar).
- El enlace de seguimiento es un token aleatorio (como el de las mesas); no expone datos de otros
  pedidos.
- Validación Zod de todo lo que manda el cliente; precios siempre desde la BD.

## Fuera de alcance

Pagos con tarjeta en línea o pasarelas, verificación automática de SINPE, repartidores con app o
rastreo GPS, cálculo del envío por distancia (es un costo fijo), SMS/WhatsApp automáticos,
factura electrónica, impresión térmica directa.

## Plan (sub-fases)

1. **5.1 Modelo y API:** cuenta sin mesa con tipo y datos del cliente, configuración en línea,
   crear pedido en línea, seguimiento, acciones del restaurante, etiqueta "lugar" en todo lo que
   muestra mesa. Tests.
2. **5.2 Cliente:** `/r/:slug`, checkout y seguimiento.
3. **5.3 Personal:** pantalla "En línea", avisos, etiquetas en cocina/caja/mesero, Ajustes y QR del
   enlace.
4. **5.4 Cierre:** reportes por canal, seed con pedidos en línea de ejemplo, README y tests.
