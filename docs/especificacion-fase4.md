# Fase 4 — Mejoras pedidas por el usuario (después de revisar la Fase 3)

Esta fase se arma con las modificaciones que el usuario va pidiendo. Cada pedido nuevo se agrega
aquí antes de programarlo. Fuente de verdad del alcance de la Fase 4.

## Pedidos (2026-10-23)

### 1. Sonido al llamar al mesero (error)

- Cuando un cliente llama al mesero desde el menú, al mesero no le suena la notificación.
  Corregir para que suene (y vibre en el celular).

### 2. Transiciones

- Agregar transiciones a todo lo que se pueda (cambios de pantalla, ventanas, listas, botones,
  tarjetas que cambian de estado), respetando "reducir movimiento" del sistema.

### 3. Alertas de cocina: pedido sin empezar

- Si un pedido lleva más de 10 minutos en cocina y no ha empezado su preparación, su tarjeta se
  marca con contorno rojo animado.
- Sonido + notificación a cocina. Si hay varios en rojo, una sola notificación general y un solo
  sonido (que no sea estresante).

### 4. Alertas de platos listos sin entregar

- Si un plato está listo y lleva esperando entre 5 y 8 minutos (valor a definir) sin entregarse,
  notificar al mesero y remarcarlo en verde con animación.
- Igual que en cocina: varios a la vez → una sola notificación y un solo sonido.

### 5. Mesas más visuales

- Las mesas (pantalla del mesero y del panel) llevan un ícono de mesa y efecto al pasar el cursor.

### 6. Cantidad de personas al escanear el QR

- Al escanear el QR se pregunta cuántas personas están en la mesa / van por esa cuenta.
- Objetivo: que si alguien de otra mesa escanea el código no haya inconsistencias al entregar.

### 7. Pagar junto o separado

- En caja se pregunta si la cuenta se paga toda junta o separada.
- Separado: se pueden armar grupos con los ítems de la cuenta y cada grupo se cobra (método de
  pago propio) y se imprime su propio comprobante.

### 8. Registro de restaurantes

- Hoy no hay forma de crear una cuenta. Agregar registro: datos del local y datos del dueño.
- Después del registro, una parte de personalización: ubicación con Google Maps, logo, eslogan,
  banner, etc. Todo eso lo ve el cliente en el menú de forma bonita.

### 9. Animación de carga

- Al entrar (dueño y demás roles) y cuando el cliente escanea el QR, una animación de carga con un
  cuchillo y un tenedor cruzándose.

### 10. Navegación

- La barra lateral del panel se esconde si el cursor no está encima (se despliega al acercarlo).
- En el celular, el menú de opciones es desplegable y se ve bonito.

## Decisiones del usuario (2026-10-23)

- **Platos listos:** avisar al mesero a los **5 minutos** sin entregar.
- **Avisos:** de las dos maneras a la vez: dentro de la app y notificación del sistema. La
  campanita con sus avisos está siempre visible y no se pierde al cambiar de pantalla.
- **Personas por mesa:** el primero que escanea dice cuántos son (el cupo). Si alguien más entra
  y el cupo está lleno, ve "Mesa N ya tiene una cuenta de X personas, ¿está en esta mesa?"; si
  sigue, a quienes ya están en la mesa les llega un aviso para **aceptarlo o rechazarlo** (al
  aceptar, el cupo sube en 1). El mesero NO aprueba. Si hay insistencia (2–3 intentos
  rechazados), la mesa se **bloquea** para nuevos ingresos y se puede desbloquear después (por
  si llega alguien de verdad).
- **Cuentas separadas:** cada grupo sale con su pre-cuenta impresa ("NO ES FACTURA ELECTRÓNICA").
- **Registro** (el usuario pidió recomendación; se adopta): el restaurante queda **activo al
  instante**, sin confirmar el correo por ahora (enviar correos requiere un servicio y una
  librería nueva; se puede agregar después). Protección: límite de registros por IP, slug único y
  el superadmin puede desactivar un restaurante (ya existe en la API).
- **Mapa:** a criterio, pero que se vea bonito. Se hace sin clave de Google: el dueño pega la
  dirección o el enlace de Google Maps y el cliente ve una tarjeta con el mapa incrustado y el
  botón "Cómo llegar".

## Fuera de alcance (heredado de la Fase 3, salvo que el usuario lo pida)

Pagos en línea, SINPE automático, factura electrónica de Hacienda (los comprobantes de cuentas
separadas son pre-cuentas: "NO ES FACTURA ELECTRÓNICA"), impresión directa a impresoras térmicas,
panel del superadmin, cobro de mensualidades, despliegue a producción, traducción automática con
IA, inventario.
