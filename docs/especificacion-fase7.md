# Fase 7 — Domicilio: ubicación y repartidores

Fuente de verdad del alcance de la Fase 7. Sale del bloque "Domicilio" (puntos 6 y 7) de
`docs/mejoras-pendientes.md`. Decisiones del usuario (2026-11-01):

- **Ubicación:** botón "Usar mi ubicación actual" **y** un mapa para mover el pin. Se aprueba la
  librería **Leaflet** con mapas de OpenStreetMap (gratis, sin clave).
- **Asignación:** el restaurante asigna el repartidor a cada pedido a domicilio.
- **Efectivo:** se cuadra en caja: la caja ve cuánto efectivo trae cada repartidor y marca
  "Recibido".

## Cliente (pedido a domicilio)

- En el checkout a domicilio, además de la dirección escrita (que sigue siendo obligatoria):
  - "Usar mi ubicación actual" (API del navegador; necesita HTTPS o localhost).
  - Un mapa con un pin que se puede mover para corregir el punto. Opcional: si no marca nada, el
    pedido sale solo con la dirección escrita.
- El punto se guarda con el pedido (latitud y longitud).

## Restaurante

- Nuevo rol **REPARTIDOR** (se crea en Personal como los demás).
- Pantalla "En línea": en cada pedido a domicilio aceptado se elige el repartidor (se puede
  cambiar mientras no haya salido). La tarjeta muestra el repartidor y "Ver en el mapa" si el
  cliente marcó su ubicación.
- **Pantalla del repartidor** (`/repartos`, en el celular): solo sus entregas. Por cada una:
  cliente, "Llamar", dirección, referencia, "Abrir en Google Maps" y "Abrir en Waze" (al punto
  exacto o, si no hay, a la dirección escrita), total y cómo paga (efectivo: cuánto cobrar; SINPE
  verificado: "Ya pagado"). Botones "Salí" (cuando está listo) y "Entregué" (con el método de
  pago). Aviso con sonido cuando le asignan una entrega.
- **Caja → Efectivo de repartidores:** por repartidor, los pedidos entregados y cobrados en
  efectivo que aún no se cuadraron y su total. "Recibido" los marca como cuadrados.
- Dueño, caja y mesero pueden seguir marcando "Salió" y "Entregado" desde "En línea" (por si no
  hay repartidor con la app).

## Seguridad

- El repartidor solo ve y cambia los pedidos asignados a él (404 si no es suyo).
- El repartidor asignado tiene que ser un usuario REPARTIDOR activo del mismo restaurante.
- Latitud y longitud validadas con Zod (rangos válidos); el resto igual que la Fase 5.

## Fuera de alcance

Rastreo en vivo del repartidor (punto 8, fase propia), cálculo del envío por distancia, rutas
optimizadas, varias entregas por viaje, cobro con tarjeta en línea. Lo heredado de la Fase 5.

## Plan (sub-fases)

1. **7.1 Modelo y API:** rol REPARTIDOR, ubicación en el pedido, asignar repartidor, rutas del
   repartidor, efectivo por cuadrar, sala de Socket.IO del repartidor, tests.
2. **7.2 Cliente:** "Usar mi ubicación" y mapa con pin (Leaflet) en el checkout.
3. **7.3 Personal:** asignar en "En línea", pantalla del repartidor, efectivo en caja, rol en
   Personal, seed, README.
