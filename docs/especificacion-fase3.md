# Proyecto: Sistema de pedidos QR para restaurantes (Costa Rica) — Fase 3

> Especificación original entregada por el usuario el 2026-10-22. Fuente de verdad del alcance
> de la Fase 3. No editar salvo que el usuario cambie requisitos (y anotarlo en MEMORY.md).

## Contexto
Las Fases 1 y 2 están completas: API multi-restaurante, auth con roles, pedidos en tiempo
real con Socket.IO, cuentas por mesa, pantallas funcionales de cocina, mesero y caja, y el
frontend del comensal (apps/menu) con el diseño aprobado.
Lee el código existente, el README y los tokens de diseño de apps/menu antes de empezar.
Respeta la estructura, el patrón routes → controller → service → Prisma, las reglas
multi-tenant y los esquemas Zod de packages/shared.

En esta fase hacemos que el dueño pueda manejar su restaurante solo, sin pedirnos ayuda,
y llevamos la app del personal (apps/staff) al mismo diseño del comensal.

## Stack
El mismo de las fases anteriores. Librerías nuevas permitidas (no agregar otras sin preguntar):
- sharp (procesar imágenes en la API)
- @aws-sdk/client-s3 (Cloudflare R2 es compatible con S3)
- multer (recibir archivos)
- pdfkit (PDF de los QR)
- @dnd-kit/core y @dnd-kit/sortable (ordenar arrastrando)
- recharts (gráficos de reportes)
- lucide-react (íconos)

## Identidad visual
Usar exactamente los mismos tokens de apps/menu (Poppins, amarillo #F7A91C, morado #5B2DB5,
neutros con tinte lila, radios, modo oscuro). Moverlos a packages/shared (o a un preset de
Tailwind compartido) para que ambas apps usen la misma fuente de verdad.
- Amarillo: estados que piden atención (pendiente, pidió la cuenta, llamada)
- Morado: acciones principales y navegación activa
- Verde: listo / entregado / pagado; rojo: cancelado, agotado, demorado
- Nunca colores fijos en componentes; todo por variables CSS

## 1. Imágenes de los platos y del logo
- Interfaz `StorageDriver` con dos implementaciones:
  - `LocalDriver` para desarrollo (guarda en apps/api/uploads y la sirve en /uploads)
  - `R2Driver` para producción (variables R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL)
  - Se elige con STORAGE_DRIVER=local|r2
- Reemplazar el 501 de POST /uploads/firma por:
  - POST /uploads/imagen (multipart, rol DUENO): acepta JPG, PNG, WEBP, HEIC; máximo 8 MB
  - Validar el tipo real del archivo (no solo la extensión)
  - Con sharp: rotar según EXIF, quitar metadatos, recortar cuadrado centrado y generar
    WebP en 2 tamaños: 320 px (lista) y 960 px (detalle), calidad ~78
  - Guardar en la ruta `restaurantes/{restauranteId}/platos/{uuid}-{tamaño}.webp`
  - Responder { url320, url960 }
- Al reemplazar o borrar la foto de un plato, borrar los archivos viejos
- Logo del restaurante: mismo flujo, sin recorte, máximo 512 px

## 2. QR imprimibles
- GET /mesas/qr.pdf?ids=... (rol DUENO): PDF tamaño carta con tarjetas recortables
  (2×3 por hoja) que incluyan logo, nombre del restaurante, QR grande, número de mesa y el
  texto "Escanee para ver el menú y pedir / Scan to see the menu and order"
- Opción de una tarjeta por hoja (para acrílicos de mesa)
- Al regenerar el token de una mesa, avisar en la interfaz que hay que reimprimir ese QR

## 3. Horarios, estado abierto/cerrado y promoción
Nueva migración:
- HorarioRestaurante: restauranteId, diaSemana (0-6), abre (HH:mm), cierra (HH:mm);
  permitir más de un turno por día y turnos que pasan de medianoche
- Restaurante: `zonaHoraria` (default America/Costa_Rica), `cerradoManual` (bool),
  `platoDestacadoId` nullable, `textoPromoEs`, `textoPromoEn`, `precioPromo` nullable
- Función pura `estaAbierto(horarios, ahora, zonaHoraria)` en packages/shared con tests
- El menú público devuelve `abierto`, `horarioHoy` y la promoción
- Si está cerrado, la API rechaza pedidos con 423 y un mensaje claro

## 4. Panel del dueño (apps/staff, rol DUENO) — pensado para computadora y tablet
Barra lateral en escritorio; navegación inferior en celular.

Inicio
- Ventas de hoy, cuentas abiertas, ticket promedio, pedidos pendientes y platos agotados
- Accesos rápidos: "Marcar agotado", "Cerrar temporalmente", "Imprimir QR"

Menú
- Categorías con ícono (selector de emojis o íconos predefinidos), nombre ES/EN,
  activar/desactivar y ordenar arrastrando
- Platos por categoría: foto, nombre, precio, interruptor de agotado y de activo,
  ordenar arrastrando, duplicar y eliminar (con confirmación dentro de la página)
- Formulario de plato: fotos (arrastrar o tomar con la cámara del celular), nombres y
  descripciones ES/EN, precio, estación (cocina/bar), alérgenos y editor de grupos de
  modificadores (obligatorio, mínimo, máximo, opciones con precio extra)
- Vista previa en vivo de cómo se ve el plato en el celular del cliente
- Avisos claros si falta la traducción al inglés o la foto
- Cambiar el precio de un plato NO altera las cuentas abiertas (ya se copia el precio en el pedido)

Mesas y QR
- Lista de mesas con estado, crear varias a la vez (ej. "de la 1 a la 12"),
  activar/desactivar, regenerar token, descargar PDF de QR

Personal
- Crear, editar y desactivar usuarios; asignar rol y estaciones (para COCINA)
- Restablecer contraseña (genera una temporal que se pide cambiar al entrar)
- Ver último acceso

Dispositivos de cocina y bar (inicio con PIN)
- El dueño "vincula" una tablet: genera un código de 6 dígitos válido 10 minutos; la tablet lo
  ingresa y recibe un token de dispositivo de larga duración ligado a una estación
- Luego el personal entra en esa tablet con un PIN de 4 dígitos (guardado con hash),
  sin correo
- El dueño puede ver y revocar dispositivos
- Rate limiting estricto y bloqueo temporal tras 5 PIN incorrectos

Ajustes
- Datos del restaurante, logo, color del acento (opcional; si se cambia, aplicarlo al menú
  del comensal validando contraste suficiente), idiomas, moneda
- Horarios por día y botón "Cerrar temporalmente"
- Impuestos: IVA, servicio y si los precios incluyen impuestos
- Modo de confirmación de pedidos (SIEMPRE / PRIMER_PEDIDO / NUNCA)
- Promoción destacada del banner

Reportes
- Filtro por rango de fechas (hoy, ayer, 7 días, 30 días, personalizado)
- Ventas por día (gráfico), por hora del día (horas pico), por categoría y top de platos
- Platos vistos vs. pedidos (registrar vistas del detalle del plato en el menú público, de
  forma anónima y agregada)
- Tiempo promedio de preparación por estación y pedidos demorados
- Cancelaciones con motivo
- Ventas por método de pago (efectivo, tarjeta, SINPE)
- Exportar a CSV
- Todas las consultas agregadas en SQL (no traer miles de filas a Node) con índices adecuados

## 5. Rediseño de la app del personal con la identidad visual

Estación (cocina/bar, tablet horizontal)
- Columnas por estado (Nuevos, En preparación, Listos) con tarjetas grandes legibles a 1 metro
- Tarjeta: mesa en grande, hora, temporizador (amarillo a 10 min, rojo a 20 min),
  ítems con cantidad, modificadores y notas resaltadas en amarillo
- Tocar el ítem avanza su estado; "deshacer" disponible por 5 segundos
- Botón "Activar sonido", Wake Lock, indicador de conexión y resincronización (ya existen;
  mantenerlos)

Mesero (celular)
- Cuadrícula de mesas con colores por estado e insignias (pedido por confirmar, llamada,
  pidió la cuenta, platos listos)
- Bandeja de pendientes ordenada por antigüedad
- Tomar pedido reutilizando los componentes del menú del comensal
- Vibración y sonido al llegar algo nuevo

Caja (computadora)
- Cuentas abiertas con las que pidieron cobrar arriba
- Detalle con desglose, método de pago y cerrar cuenta
- Pre-cuenta para imprimir en 80 mm que diga claramente "NO ES FACTURA ELECTRÓNICA"

## 6. Calidad
- Estados de carga con esqueletos, estados vacíos útiles y mensajes de error que digan cómo
  resolver el problema
- Formularios con validación Zod compartida y errores junto a cada campo
- Accesible: foco visible, etiquetas en botones de solo ícono, objetivos táctiles de 44 px
- Responsive real en 360 px, 768 px y 1280 px

## Tests obligatorios
- `estaAbierto`: turnos normales, varios turnos, turnos que cruzan medianoche, cierre manual
- Pedido rechazado con 423 cuando el restaurante está cerrado
- Subida de imagen: rechaza tipos falsos y archivos grandes; genera los 2 tamaños;
  un dueño no puede borrar imágenes de otro restaurante
- PDF de QR solo con mesas del propio restaurante
- Vinculación de dispositivo: código vencido, código reutilizado, bloqueo tras 5 PIN fallidos,
  dispositivo revocado ya no puede conectarse por socket
- Reportes: totales cuadran con la suma de cuentas cerradas del seed; aislamiento entre
  restaurantes
- Reordenar categorías y platos persiste el orden correctamente

## Seed
Actualizar con fotos de ejemplo para los platos (imágenes locales en el repo con licencia
libre o generadas simples), horarios de la Soda La Esquina (lunes a sábado 7:00–21:00,
domingo 8:00–15:00), una promoción activa, un dispositivo de cocina vinculado y 30 días de
cuentas cerradas generadas al azar para que los reportes tengan datos.

## Fuera de alcance (NO implementar)
Pagos en línea, SINPE automático, factura electrónica, impresión directa a impresoras
térmicas, panel del superadmin, cobro de mensualidades, despliegue a producción,
traducción automática con IA, inventario.

## Forma de trabajar
1. Lee el código y muéstrame un plan breve. Espera mi aprobación.
2. Orden: tokens compartidos → almacenamiento de imágenes → horarios y promoción →
   panel del dueño (menú, mesas/QR, personal, ajustes) → dispositivos con PIN →
   reportes → rediseño de estación, mesero y caja → tests → seed.
3. Al final de cada paso ejecuta build, migraciones, lint y tests y corrige antes de seguir.
4. Actualiza el README con las nuevas variables de entorno y un recorrido de prueba.

## Criterios de aceptación
- Como dueño, desde el celular creo un plato con foto tomada con la cámara, le pongo
  modificadores, lo veo en la vista previa y aparece en el menú del comensal en segundos.
- Descargo el PDF con los QR de 12 mesas y al escanear cualquiera abre la mesa correcta.
- Fuera del horario, el menú muestra "Cerrado" y no deja pedir.
- Vinculo una tablet con el código, el cocinero entra con su PIN y recibe pedidos solo de su estación.
- Los reportes de 30 días cargan en menos de 1 segundo y el CSV coincide con lo que muestra la pantalla.
- Cocina, mesero y caja se ven con el mismo estilo del menú del comensal, en modo claro y oscuro.
- Todos los tests pasan.
