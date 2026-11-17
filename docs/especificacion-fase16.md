# Fase 16 — Rediseño de Caja y Ajustes (ancho completo)

Pedido del usuario (2026-11-16): "vamos a hacer cambios visuales. La vista de la caja: haz otro
diseño, no me gusta ese diseño; que la parte de la factura agarre todo el ancho de la pantalla y
acomodar de mejor manera las cuentas abiertas, y la info de la caja hacerla a un lado, que se vea
pero que no estorbe. Todo está muy centrado y sobra mucho margen a los lados, lo cual se ve feo. En
la parte de configuración también pasa lo mismo: todo está hacia abajo y hay que hacer scroll;
mejor hagámoslo con una barra de menú y que se carguen los formularios necesarios para cada cosa y
que ocupen el ancho de la pantalla igual."

## Caja

- Ocupa todo el ancho (sin el máximo de 1152 px).
- **Izquierda:** cuentas abiertas en una columna fija con su propio scroll y filtro "Todas /
  Pidieron cuenta". En celular y tableta, en cuadrícula de 2 o 3 columnas.
- **Centro (lo más ancho):** el cobro. En pantallas anchas se divide en dos: a la izquierda lo
  que se consumió (platos, desglose, grupos ya cobrados) y a la derecha cómo pagan (método, vuelto,
  factura a nombre de…, botón de cobrar).
- **Derecha:** panel de caja (turno y arqueo, efectivo de repartidores, factura electrónica), que
  se puede **ocultar** con un botón y queda recordado en esa computadora. En pantallas medianas va
  debajo de las cuentas.

### Ajuste del diseño de la caja (2026-11-16)

Pedido del usuario: "el rediseño para la caja será tal cual como está, pero que haya un menú
desplegable para lo que viene siendo la parte de pedidos en línea y para la parte de facturación
electrónica". También preguntó para qué sirve "Enviar por correo".

- En el panel de caja, "Pedidos en línea" (efectivo de repartidores) y "Factura electrónica" son
  secciones **desplegables**, cerradas por defecto, con un contador en el título (por recibir /
  con problema). Se recuerda cuáles quedaron abiertas en esa computadora.
- El botón pasa a llamarse **"Enviar copia al cliente"** y la sección explica que, si el cliente
  dio su correo al cobrar, la copia sale sola al aceptarse.

Corrección del usuario (2026-11-16): "el menú desplegable está bien, pero no quería que se abriera
en la misma pantalla de la caja sino aparte… capaz hay muchas solicitudes y se va a llenar esa
pantalla… mejor hacer una pantalla específica para cada cosa."

- En la caja queda un **menú desplegable** ("Más") en el encabezado con dos opciones, cada una con
  su contador: **Efectivo de repartidores** (por recibir) y **Factura electrónica** (con problema /
  en Hacienda). Cada una abre **su propia pantalla** a todo el ancho, con botón para volver a Caja.
- `/caja/repartidores`: efectivo pendiente de cada repartidor, en tarjetas, con «Recibido».
- `/caja/comprobantes`: todos los comprobantes recientes en cuadrícula, con filtro (Todos, Con
  problema, En Hacienda, Aceptados) y las mismas acciones (PDF, enviar copia, anular, reintentar).
- El panel lateral de la caja queda solo con el turno y el arqueo.

## Ajustes

- **Barra de menú** con las secciones: Horario, General (idiomas, moneda, impuestos, confirmación),
  Pedidos en línea, Wi-Fi y Factura electrónica. Solo se muestra el formulario de la sección
  elegida (queda en la dirección, `?seccion=`, para volver directo).
- En computadora el menú va a la izquierda; en celular, arriba con desplazamiento horizontal.
- Los formularios usan el ancho disponible (tarjetas en columnas cuando caben).

## Panel

- El contenedor del panel pasa de 1152 px a 1600 px de ancho máximo, para no dejar márgenes
  grandes en pantallas anchas.

## Fuera de alcance

Cambiar la lógica de cobro, del arqueo o de la factura electrónica (solo es diseño).

## Plan

1. **16.1** Caja a ancho completo con tres zonas y panel lateral ocultable.
2. **16.2** Ajustes con barra de menú y secciones; panel a 1600 px.
