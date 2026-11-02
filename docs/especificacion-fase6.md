# Fase 6 — Diseño

Fuente de verdad del alcance de la Fase 6. Sale del bloque "Diseño" (puntos 1–5) de
`docs/mejoras-pendientes.md`. El usuario pidió aplicar las mejoras el 2026-10-29.

## Alcance

1. **Colores con significado en los íconos:** verde = listo/ok, ámbar = esperando, rojo =
   urgente, azul = información, morado = marca. Siempre con texto o forma, no solo color. Los
   íconos de la barra lateral del panel y de las pestañas del personal llevan un fondo suave del
   color de su sección, el mismo en todas las pantallas, con la etiqueta de texto disponible:
   - Morado: Inicio/Panel, Personalizar.
   - Ámbar: Menú.
   - Verde: Mesas y QR, Mesero/Mesas, Caja.
   - Rojo: Cocina y bar.
   - Azul: Personal, Dispositivos, Reportes, Pedidos en línea.
   - Gris: Ajustes.
2. **Animación de los íconos de categoría** al tocarlos en el menú del cliente (rebote corto). Solo
   CSS; se desactiva con "reducir movimiento".
3. **Paleta neutra/universal** para el sistema: grises de base y un color de acento. El usuario
   elige entre 2–3 opciones viéndolas aplicadas. El color propio de cada restaurante en su menú se
   mantiene.
4. **Tipografía:** cambiar Poppins por una pareja de títulos + texto más legible (Google Fonts, como
   hoy) y números alineados (`tabular-nums`) en los montos. El usuario elige entre las opciones.
5. **Editor del menú más claro:** categorías como bloques, cada una con su botón "+ Agregar plato"
   adentro, guía para empezar ("1. Cree una categoría · 2. Agregue platos") y estados vacíos que
   dicen qué hacer. Se muestra un boceto y el usuario lo aprueba antes de programar.

## Decisiones del usuario (2026-10-29)

- **Paleta D:** gris cálido + grafito (casi monocromo). Claro: fondo #efeeec, acento #23252a; oscuro:
  fondo #11100f, acento #ecebe8 con texto oscuro encima. El menú del cliente conserva su morado por
  defecto y el color propio de cada restaurante.
- **Letra:** Plus Jakarta Sans para todo (respondió «opción C»: la tercera de la lista numerada).
  Cifras de ancho fijo en toda la interfaz.
- **Editor del menú:** aprobado el boceto (categorías como bloques que se contraen, «+ Agregar
  plato» en cada una, guía de 3 pasos mientras no hay platos).

## Fuera de alcance

Todo lo demás de `docs/mejoras-pendientes.md` (domicilio, clientes, superadmin, despliegue), modo
de color por restaurante para el panel del personal, librerías nuevas de íconos o de animación.

## Plan (sub-fases)

1. **6.1** Colores con significado en barra lateral y pestañas + animación de categorías.
2. **6.2** Paleta neutra (opción elegida por el usuario).
3. **6.3** Tipografía (opción elegida por el usuario) + `tabular-nums` en montos.
4. **6.4** Editor del menú (según el boceto aprobado).
5. **6.5** Revisión final: build, lint, tests, README.
