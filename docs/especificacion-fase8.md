# Fase 8 — Clientes: lista, cuenta, fidelidad y comprobante

Fuente de verdad del alcance de la Fase 8. Sale del bloque "Clientes" (puntos 9–12) de
`docs/mejoras-pendientes.md`. Decisiones del usuario (2026-11-01):

- **Cuenta del cliente:** con **correo y contraseña** (un PIN sería tedioso: si lo olvida, el
  restaurante tendría que cambiarlo y se pueden perder ventas). Pedir como invitado sigue
  funcionando. **Recuperar la contraseña por correo queda pendiente** hasta elegir el proveedor de
  correos ("luego vemos"); mientras tanto el cliente puede cambiarla estando dentro de su cuenta.
- **Fidelidad:** **tarjeta de sellos**.
- **Comprobante:** **solo WhatsApp** (botón con el resumen, enlace `wa.me`, gratis).
- **Alcance:** lista de clientes y fidelidad **solo para pedidos en línea** (ahí siempre hay
  teléfono).

## Lista de clientes (dueño)

- Panel → **Clientes**: un cliente por teléfono, armado con los pedidos en línea (funciona sin que
  se registre). Nombre (el del último pedido), teléfono, pedidos entregados, total gastado, último
  pedido, sellos, si tiene cuenta y la marca **Frecuente** (3 o más pedidos entregados en los
  últimos 30 días). Buscar por nombre o teléfono.
- El teléfono se compara solo por sus dígitos (los últimos 8): "8888-1234" y "+506 8888 1234" son
  el mismo cliente.

## Cuenta del cliente (menú en línea `/r/:slug`)

- **Crear cuenta** (nombre, teléfono, correo, contraseña de 8+ caracteres) y **Entrar** (correo y
  contraseña). La cuenta es de ese restaurante (cada restaurante tiene sus propios clientes).
- Con la cuenta abierta, el checkout se llena solo (nombre, teléfono, dirección, referencia y punto
  del mapa) y el pedido queda asociado a la cuenta.
- **Mi cuenta:** editar los datos y la dirección, cambiar la contraseña, ver los sellos y los
  últimos pedidos (con su enlace de seguimiento) y salir.
- La sesión dura 30 días en ese celular.

## Fidelidad: tarjeta de sellos

- Ajustes → Pedidos en línea: activar, **cuántos sellos** dan el premio (por defecto 8) y **cuál es
  el premio** (texto, p. ej. "Un casado gratis").
- Cada pedido en línea **entregado** suma un sello al teléfono del cliente (tenga cuenta o no).
- El cliente ve su avance en el seguimiento del pedido y en Mi cuenta ("5 de 8 sellos").
- El personal ve los sellos en la tarjeta del pedido en "En línea"; cuando el cliente completa la
  tarjeta aparece **Canjear premio**: se descuentan los sellos y queda registrado quién lo canjeó.
  El premio se entrega a mano (no cambia el total del pedido).

## Comprobante por WhatsApp

- En el seguimiento, **Enviar por WhatsApp** abre WhatsApp con el resumen: restaurante, número de
  pedido, platos, totales y "NO ES FACTURA ELECTRÓNICA". La persona elige a quién enviarlo.

## Seguridad

- Contraseñas con bcrypt; sesión con token opaco aleatorio (en la BD solo su hash), separado de los
  tokens del personal.
- Entrar: mismo error para correo inexistente o contraseña mala; límite de intentos por IP.
- La cuenta solo vale en su restaurante; los datos de clientes solo los ve el dueño de ese
  restaurante.

## Fuera de alcance

Recuperar la contraseña por correo (pendiente del proveedor), SMS, envío automático por WhatsApp
Business, puntos por monto, fidelidad en pedidos de mesa, descuentos automáticos en el total.

## Plan (sub-fases)

1. **8.1 Modelo y API:** cliente registrado y sesiones, teléfono normalizado, configuración de
   fidelidad, sellos y canje, lista de clientes, pedido asociado a la cuenta. Tests.
2. **8.2 Cliente:** crear cuenta / entrar, Mi cuenta, checkout prellenado, sellos y WhatsApp en
   el seguimiento.
3. **8.3 Personal:** Panel → Clientes, ajustes de fidelidad, sellos y canje en "En línea", seed,
   README.
