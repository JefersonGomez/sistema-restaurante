# Mejoras y pendientes (backlog)

Lista de ideas del usuario (2026-10-26) y lo que quedó pendiente. Nada de esto está programado
todavía: antes de empezar cada bloque se convierte en una spec de fase y el usuario lo aprueba.

## Pendiente de fases anteriores

- Prueba completa del usuario de las Fases 4 y 5 (incluida la 5.5: tiempo para pagar el SINPE).
- **Panel del superadministrador** (`/admin` dice "Próximamente"). Ya existe el API para crear,
  listar y activar/suspender restaurantes. Falta la pantalla: lista con uso, activar/suspender,
  detalle, restablecer contraseña del dueño, resumen general y (si se cobra) plan y vencimiento.
  Preguntas abiertas: ¿se cobra mensualidad?, ¿registro abierto o con aprobación?, ¿"entrar como"
  un restaurante? (recomendado: no).
- **Despliegue a producción** (hosting, BD, fotos en la nube, dominio con HTTPS). Varias mejoras de
  abajo (ubicación, rastreo) **necesitan HTTPS** para funcionar en el celular.

## Diseño (bajo riesgo, rápido) — en la Fase 6 (`docs/especificacion-fase6.md`)

1. **Paleta de colores neutra/universal** para el sistema (base de grises + un color de acento),
   con 2–3 opciones para elegir viéndolas aplicadas. El color propio de cada restaurante en su menú
   se mantiene.
2. **Tipografía:** revisar la actual (Poppins) por una pareja títulos + texto más legible, números
   alineados en montos.
3. **Íconos con colores con significado:** verde = listo/ok, ámbar = esperando, rojo = urgente,
   azul = información, morado = marca. Siempre acompañados de texto o forma (no solo color).
   **Íconos de la barra lateral** (panel y pantallas del personal): cada uno con un contorno/fondo
   suave del color de su significado (p. ej. Hoy, Menú, Mesas, Reportes, En línea), el mismo en
   todas las pantallas, con la etiqueta de texto siempre disponible.
4. **Animación de los íconos de categoría** (bebidas, desayunos…) al tocarlos en el menú del
   cliente. Solo CSS; se desactiva si el usuario pidió "reducir movimiento".
5. **Editor del menú más claro para el dueño:** categorías como bloques, cada una con su botón
   "+ Agregar plato" adentro, guía para empezar ("1. Cree una categoría · 2. Agregue platos") y
   estados vacíos que dicen qué hacer. Mostrar boceto antes de programar.

## Domicilio — 6 y 7 en la Fase 7 (`docs/especificacion-fase7.md`)

6. **Ubicación en el mapa (opcional):** botón "Usar mi ubicación actual" (sin librerías, API del
   navegador) y, aparte, elegir un punto en un mapa (requiere aprobar una librería de mapas, p. ej.
   Leaflet con OpenStreetMap). La dirección escrita sigue siendo posible. El repartidor recibe un
   enlace de Google Maps al punto exacto.
7. **Rol de repartidor:** pantalla de entregas asignadas, "Salí", "Entregué", cobro en efectivo,
   llamar al cliente y abrir la ruta en Google Maps / Waze.
8. **Rastreo en vivo del repartidor:** el celular del repartidor manda su posición por Socket.IO y
   el cliente la ve en un mapa. Hoy está **fuera de alcance** (Fase 5: "rastreo GPS"); sería una
   fase propia. Limitación de una app web: el repartidor debe tener la página abierta y la pantalla
   encendida (en iPhone el navegador deja de mandar la ubicación en segundo plano).

## Clientes

9. **Lista de clientes** a partir de los pedidos en línea (por teléfono): cuántos pedidos, cuánto
   gasta, último pedido, clientes frecuentes. Funciona sin que el cliente se registre.
10. **Cuenta de cliente opcional:** pedir como invitado sigue funcionando; si tiene cuenta, inicia
    sesión y sus datos y dirección se llenan solos y sus pedidos quedan asociados.
11. **Fidelidad:** el dueño define recompensas (puntos por compra o "tarjeta de sellos": cada N
    pedidos, uno gratis); el cliente ve su avance; el personal valida el canje.
12. **Comprobante del pedido por correo** (no es factura electrónica de Hacienda, que sigue fuera de
    alcance). Requiere un servicio de envío de correos (librería/proveedor a aprobar). Por WhatsApp:
    botón "Enviar por WhatsApp" con el resumen (enlace `wa.me`, gratis, lo envía la persona); el
    envío automático por WhatsApp Business tiene costo y aprobación de Meta → fuera de alcance.

## Sin internet (pregunta del usuario, 2026-11-01; "luego vemos")

Hoy todo depende de que el celular del cliente y los equipos del restaurante lleguen al servidor.

13. **QR del Wi-Fi en la tarjeta de la mesa** (recomendado primero): el dueño anota nombre y clave
    del Wi-Fi en Ajustes y el PDF de QR lleva un segundo código que conecta el celular con un toque.
    Para clientes sin datos móviles.
14. **Mesero toma el pedido** si el cliente no tiene conexión: ya existe ("Tomar pedido"); solo
    capacitación.
15. **Menú en PDF para imprimir** desde el panel, como respaldo.
16. **Router con respaldo 4G** en el restaurante (sin código): recomendación para los dueños.
17. **Aguantar cortes cortos** en los equipos del personal (guardar acciones y enviarlas al volver):
    fase futura; riesgo de conflictos.
18. **Servidor local en el restaurante** con sincronización: muy costoso (instalación por local,
    HTTPS en red local); solo para zonas con internet muy malo.

El SINPE Móvil necesita internet de todas formas.

## Orden sugerido

1. Diseño (1–5).
2. Domicilio: ubicación (6) y rol de repartidor (7).
3. Clientes: lista (9), cuentas (10), comprobante (12), fidelidad (11).
4. Superadmin y despliegue (antes de ofrecerlo a restaurantes reales).
5. Rastreo en vivo (8), con el sistema ya publicado con HTTPS.
