# Fase 18 — Aguantar cortes cortos de internet

Pedido del usuario (2026-11-16): "sigue con el modo sin internet". Ante la pregunta de qué resolver,
eligió **"Aguantar cortes cortos"** (no el servidor local en el restaurante ni solo recomendaciones).

Ya hecho antes (Fase 11): QR del Wi-Fi en las mesas, menú en PDF para imprimir; y el mesero puede
tomar el pedido de un cliente sin datos.

## Qué resuelve

Caídas de internet de minutos en el restaurante. KitchaGo sigue en la nube; no hay servidor local.

- **Aviso** en todas las pantallas del personal: "Sin conexión: lo que haga se guarda en este equipo
  y se envía solo al volver" con cuántas acciones esperan; al volver, "Enviando…" y luego listo.
- **Cola en el equipo** (se guarda aunque se cierre la pestaña) solo para acciones seguras de
  repetir, que se envían en orden al volver la conexión:
  - Cocina: empezar, marcar listo (plato o pedido), deshacer, "Listo · avisar mesero".
  - Mesero: tomar pedido (lleva su identificador para no duplicarse), confirmar pedido, marcar
    entregado, atender llamada.
- Si al enviar una acción el servidor la rechaza (otro equipo ya la cambió), se descarta y se avisa
  cuántas no se aplicaron.
- **Necesitan conexión** (se avisa claramente y no se guardan): cobrar, cerrar y abrir caja,
  pedidos en línea, ajustes y todo lo del panel del dueño. La factura electrónica ya tiene su propia
  cola en el servidor.
- El celular del cliente sin internet no puede pedir (para eso el mesero toma el pedido).

## Plan

1. **18.1** Estado de conexión, aviso global y cola de acciones de cocina y mesero (con su lógica
   probada en `shared`). ✅
2. **18.2** Última foto de los datos: cocina y mesero guardan en el equipo lo último que leyeron
   (también el menú, para tomar pedidos). Sin internet la pantalla sigue con lo que tenía, sin
   mensajes de error y con lo marcado sin conexión a la vista; si se abre de cero sin internet,
   muestra la última foto y el aviso dice de qué hora es. Las fotos se borran al cerrar sesión.
   Límite: al abrir de cero sin internet, la foto no incluye lo hecho después sin conexión. ✅
3. **18.3** Que el panel abra aunque se recargue sin internet (service worker escrito a mano, sin
   librerías: guarda la aplicación y la abre desde el equipo).

## Fuera de alcance

Servidor local en el restaurante, cobrar sin conexión, pedidos del cliente sin internet,
sincronizar cambios de varios equipos que se contradicen (se queda lo que llegó primero).
