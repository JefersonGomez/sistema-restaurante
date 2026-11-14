# Fase 10 — Cocina (KDS) para muchos pedidos y estilo de las pantallas de operación

Pedido del usuario (2026-11-12): rediseñar "Cocina/Bar" para que funcione con muchos pedidos a la
vez, con su especificación detallada (tipografía, colores, barra superior, franja "Pendiente
ahora", arreglo del tiempo, pedidos olvidados, tablero, tarjeta y comportamiento), y aplicar la
misma tipografía y estilo a **todas las pantallas de operación** (cocina, mesero, caja, en línea,
repartidor), mejorando su UI en esa línea. Se mantiene el tema oscuro y la lógica de estados.

## Tipografía y colores (pantallas de operación)

- Google Fonts: **Bricolage Grotesque** (600, 700, 800) para títulos, pestañas y nombres de
  pedido; **Plus Jakarta Sans** (400–800) para el resto. Números con `tabular-nums`.
- Encabezado: título 24px/800 (-0.02em); subtítulo del negocio 11px/700 en mayúsculas (0.1em,
  #A1A1AA); pestañas 16px/600 (activa 800) con ícono de 18px, alto 40px, radio 10px; la activa es
  un bloque #F2F2F2 con texto #111214.
- Tema de operación (siempre oscuro): fondo #111214, superficies #1A1B1E, bordes #2C2E33, texto
  #F2F2F2, secundario #A1A1AA. Estados: nuevo azul #60A5FA, en preparación ámbar #F5B544, listo
  verde #4ADE80, atrasado/alergia rojo #F87171.

## Cocina / Bar (KDS)

Según la especificación del usuario: KPIs (nuevos, en preparación, listos, atrasados, espera
promedio m:ss), buscador por mesa o número de pedido, selector segmentado de estación con
contadores, vista normal/compacta, franja "PENDIENTE AHORA" con resaltado para cocinar en tanda,
tiempos "m:ss" / "X h Y min" / "X d Y h", pedidos de más de 2 h fuera de la cola con aviso rojo y
"Marcar como entregado", tablero Nuevos (flex 1) · En preparación (flex 2.4, atrasados arriba) ·
Listos (≈300px, lista compacta con "Entregado"), tarjetas con canal, píldora de tiempo
(verde / ámbar al 60% / rojo), barra de progreso, etiquetas (alergia roja, cambios ámbar, notas
grises, estación), ítems táctiles de 44px+ y timers cada segundo. Límite de atraso configurable
(15 min por defecto).

Adaptaciones al sistema (decididas al programar):

- **Estaciones:** no hay un campo fijo `cocina | bar`: cada restaurante crea sus estaciones. El
  selector muestra "Todas" + las estaciones del restaurante, y la etiqueta de estación aparece en
  "Todas" para los ítems que no son de la primera estación (p. ej. "BAR").
- **"Listo · avisar mesero":** cada plato se marca listo en el servidor al tocarlo (así lo ven los
  meseros y las otras pantallas al instante). Cuando el último plato queda listo, el pedido pasa
  solo a "Listos" y el mesero recibe el aviso; por eso ese botón no aparece en "En preparación".
- **Entregar desde cocina:** se permite que cocina marque **Entregado** (antes solo el mesero), para
  la columna Listos y los pedidos olvidados.
- **Etiquetas:** "alergia" se detecta en las notas del plato (contienen "alerg"); los
  modificadores que empiezan con "Sin", "Extra", "Con", "Más" o "Poco" son cambios (ámbar); el
  resto de modificadores y notas son neutras (gris).
- El límite de atraso se elige en la misma pantalla y se guarda en el dispositivo.

## Otras pantallas de operación

Mesero, Caja, En línea y Mis entregas: el mismo tema oscuro, el encabezado nuevo, títulos con
Bricolage, encabezados de columna con punto de color, contador y pista, superficies y bordes del
tema, y tiempos con el mismo formato.

## Pedidos en línea con el diseño del KDS (pedido del usuario, 2026-11-12)

"Aplica el mismo diseño o parecido a la parte de pedido en línea" (pantalla del personal). KPIs
(nuevos, sin responder > 5 min en rojo, en cocina, en camino, SINPE por verificar en rojo),
buscador (#, nombre o teléfono), filtro Todos / Recoger / Domicilio con contadores, columnas Nuevos
· En cocina (los que esperan SINPE arriba) · Listos y en camino · Terminados (lista compacta), con
scroll propio. Tarjetas como las del KDS: canal, píldora de tiempo (nuevos contra 5 min; aceptados
contra el tiempo prometido), barra de progreso (avance de cocina), "ATRASADO" / "SIN RESPONDER",
platos con check de cocina; todas las acciones de antes. "Listo para entregar" se destaca cuando
cocina terminó.

## Seguimiento del pedido en línea (pedido del usuario, 2026-11-12)

En computadora el seguimiento ocupa todo el ancho (antes era una columna de ~576 px): dos columnas,
estado grande con los pasos en horizontal + SINPE + detalle del pedido | entrega (tipo, dirección,
hora, tiempo estimado), sellos y acciones (fija al hacer scroll). En el celular, una columna con
los pasos en vertical unidos por una línea y los botones al final. Mismos datos y acciones.

## Fuera de alcance

Cambiar el modelo de estados, impresión de comandas, el resto de pantallas del cliente (menú) y el
panel del dueño (mantienen su tema).

## Plan (sub-fases)

1. **10.1 API y utilidades:** datos extra del pedido para cocina (canal, número, quién lo tomó,
   hora de listo), avanzar varios platos de un pedido en una llamada, cocina puede entregar,
   formato de tiempo compartido. Tests.
2. **10.2 KDS** nuevo.
3. **10.3 Tema y encabezado** para todas las pantallas de operación y mejoras de Mesero, Caja, En
   línea y Mis entregas.
