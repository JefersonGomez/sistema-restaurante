# Fase 20 — Simplificar el sistema

Pedido del usuario (2026-11-23): "quiero que simplifiques todo, porque hasta yo me siento abrumado
en la parte de la cocina más que todo, se ve mucho color rojo, muy poco legible, si hay muchos
pedidos se ve muy mal, me arrepiento de poner el estilo canvas en la cocina, son muchos pasos [...]
básate en otros sistemas que existan, pero manteniendo mi toque. El sonido tin tin se me hace
molesto. [...] quiero agregar también un plan que solo sirva para pedidos en línea. [...]
simplifiquemos todo lo que se pueda el sistema, porque la verdad sí está difícil de usar."

Decisiones del usuario (misma fecha):

- **Cocina:** comandas en cuadrícula (como Square, Toast o Loyverse), no columnas tipo tablero.
- **Confirmación del mesero:** que el dueño elija en Ajustes; por defecto, apagada (los pedidos del
  cliente van directo a cocina).
- **Plan nuevo "Solo en línea":** ₡7 900 al mes.
- **Sonido:** uno suave por defecto, elegible (suave, campana o sin sonido) y activado con el
  primer toque.

## Sub-fases

1. **20.1 Cocina en comandas.** ✅
   - Una tarjeta por pedido, la más vieja primero, en cuadrícula; letra grande y legible.
   - **Un toque:** "Listo" en la tarjeta despacha el pedido entero (deja de verse); no hay
     "Empezar". Tocar un plato **no hace nada** (corrección del usuario, 2026-11-23: "al tocar el
     nombre del plato cuenta como listo y no debería ser así, para eso está el botón de listo").
   - "Deshacer" unos segundos después de "Listo".
   - Color **solo en la franja del tiempo**: neutro, ámbar al acercarse al límite y rojo solo al
     pasarse. Las tarjetas no se pintan de rojo enteras.
   - Notas y extras resaltados dentro de la tarjeta (es lo que más se equivoca en una cocina).
     Las opciones del plato ("Fritos") en letra normal y legible, no en gris (aprobado por el
     usuario); los cambios "sin/extra" en ámbar y las alergias en rojo.
   - Barra de arriba mínima: cuántos pedidos, filtro de estación solo si hay más de una, y un menú
     "⋯" con Agotados, tamaño de letra y límite de tiempo.
   - "Listos para entregar" deja de ser columna: el mesero los ve en su pantalla.
2. **20.2 Sonido suave.** ✅ Un tono corto y suave por defecto; elegible: suave, campana (cocinas
   ruidosas) o sin sonido. Se activa con el primer toque en la pantalla (sin el botón amarillo).
3. **20.3 Ventanas propias.** ✅ Reemplazar las ventanas grises del navegador ("¿Por qué se
   cancela?", "¿Entregado y cobrado?") por ventanas de la app con motivos de un toque ("Se acabó",
   "El cliente cambió de idea", "Error al pedir", "Otro…").
4. **20.4 Confirmación del mesero opcional.** ✅ (ya existía `modoConfirmacion` con 3 modos: el
   default pasa a `NUNCA` y Ajustes lo muestra como un interruptor con las 2 variantes debajo.) Ajuste "El mesero confirma los pedidos del cliente",
   apagado por defecto: el pedido del QR va directo a cocina y el mesero solo recibe el aviso.
5. **20.5 Mesero en una sola pantalla.** ✅ Las mesas, con una franja arriba de lo urgente
   (llamadas, platos listos y, si está encendida la confirmación, pedidos por confirmar).
6. **20.6 Plan "Solo en línea" (₡7 900).** ✅ Menú en línea, recoger, domicilio, repartidores, cocina
   y caja; sin mesas, QR de mesa ni mesero. Las pantallas y el panel esconden lo que no incluye.
7. **20.7 Inicio y Ajustes más simples.** ✅ Asistente de inicio para el dueño (menú → mesas →
   personal → listo) y Ajustes con lo avanzado (factura electrónica, CABYS, etc.) en
   "Opcional".
   - Inicio: tarjeta "Primeros pasos" con cada paso tachado al cumplirse (hay platos, hay mesas,
     hay personal además del dueño) y botón "Ocultar" (se recuerda en el navegador). Con el plan
     Solo en línea, el paso de mesas es "Active los pedidos en línea". Indicadores: ventas,
     cuentas abiertas (solo con mesas), por confirmar (solo si hay) y agotados; el ticket promedio
     queda en Reportes.
   - Ajustes: Wi-Fi y Factura electrónica bajo "Opcional"; con Solo en línea no salen Wi-Fi ni
     "Pedidos desde el QR de la mesa".
8. **20.8 Pedidos en línea con menos pasos.** ✅ Pedido del usuario (2026-11-26): "antes de subir
   simplifica la parte de pedidos online también".
   - Sin tablero de 4 columnas ni KPIs ni buscador: una cuadrícula de tarjetas ordenada por lo que
     hay que hacer (por aceptar → SINPE por verificar → listos para entregar → en cocina → en
     camino), con **un botón principal** por tarjeta. Terminados en un desplegable abajo.
   - **"Listo" automático:** cuando la cocina toca "Listo" y ya no queda ningún plato del pedido
     por hacer, el pedido pasa solo a "Listo para entregar" (antes la caja tenía que tocarlo).
     Queda un botón chico "Ya está listo" por si no se usa la pantalla de cocina.
   - La caja ya no toca "Salió a entregar": eso lo hace el repartidor desde su celular. La caja
     asigna repartidor y, si hace falta, marca "Entregado y cobrado".
   - Tarjeta más limpia: sin barra de progreso ni marcas por plato; tiempo en minutos con el
     mismo estilo que la cocina.

Cada sub-fase se prueba en el navegador y se aprueba antes de la siguiente.

## Fuera de alcance

Cambiar el modelo de estados en la base de datos (los estados de los platos siguen igual; la cocina
solo los muestra y los cambia con menos toques), cobro automático de la mensualidad.
