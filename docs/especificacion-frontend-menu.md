# Frontend del comensal (apps/menu) — especificación

> Entregada por el usuario el 2026-10-21. Referencia visual: `prototipo_front/prototipo-menu.html`.
> Si hay diferencias entre este documento y el prototipo, manda este documento.

## Contexto
Ya existen la API (Fases 1 y 2) y el andamiaje de apps/menu (React + Vite + TypeScript + Tailwind).
Ahora vamos a construir la interfaz definitiva del comensal, basada en un prototipo aprobado
por el cliente. Lee primero el código existente de apps/menu, packages/shared y las rutas
públicas de la API (/public/...) y respeta sus tipos y esquemas Zod.

Si te adjunto el archivo `prototipo-menu.html`, úsalo como referencia visual exacta
(colores, tamaños, espaciados y comportamiento). Si hay diferencias entre este documento
y el prototipo, manda este documento.

## Stack
- React 18 + Vite + TypeScript estricto + Tailwind
- React Router (rutas: /m/:token, /m/:token/carrito, /m/:token/cuenta)
- TanStack Query para datos del servidor y Zustand para el estado local (carrito, idioma)
- socket.io-client para estados en vivo
- No agregar otras librerías de UI ni de componentes. Íconos: lucide-react.

## Identidad visual (tokens en tailwind.config y variables CSS)
- Fuente: Poppins (400, 500, 600, 700) desde Google Fonts con fallback system-ui
- Acento principal: amarillo #F7A91C (categoría activa, banner, "Pedir la cuenta")
  - fondo suave #FFF2D6, texto sobre suave #8F5300
- Acento de acción: morado #5B2DB5 (botones "+", botón principal, navegación activa)
  - fondo suave #EEE8FB
- Neutros con tinte lila: fondo de página #E7E6F0, app #FFFFFF, superficie #F6F5FB,
  superficie 2 #EEECF7, texto #1D1B2A, texto secundario #6F6C80, líneas #E4E2EE
- Peligro #DD3A2E (eliminar, agotado), éxito #1C8A57 (listo, entregado)
- Banner de promoción: fondo #17131F con franja amarilla diagonal
- Radios: 22px tarjetas grandes, 16px tarjetas y botones, 10px botones pequeños
- Modo oscuro completo siguiendo prefers-color-scheme:
  fondo #0E0D14, app #16141E, superficie #1F1C2A, superficie 2 #272336, texto #F2F0F8,
  secundario #A39FB5, líneas #2E2A3C, amarillo #FFB632, morado #8E6AEC
- Todos los colores como variables CSS; nunca colores fijos en los componentes
- Mobile-first: columna de máximo 420px. En pantallas anchas se centra como un teléfono
  con bordes redondeados de 32px y sombra; en celular ocupa todo el ancho sin bordes.
- Respetar safe-area-insets del celular (notch y barra inferior)

## Pantallas

### 1. Menú (/m/:token)
- Encabezado: nombre del restaurante, pastilla "Abierto/Cerrado" con el horario,
  pastilla "Mesa N", botón de idioma (ES/EN) y botón de campana para llamar al mesero
- Buscador (filtra por nombre en ambos idiomas, sin tildes ni mayúsculas)
- Banner de promoción opcional (si el restaurante tiene un plato destacado); se oculta al buscar
- Categorías en cuadrícula de 4 columnas con ícono y nombre; la activa en amarillo con sombra;
  tocarla de nuevo la desactiva y muestra todo
- Lista de platos: tarjeta con foto (o imagen de respaldo), nombre, descripción en 2 líneas,
  precio y botón "+" morado. Los agotados se ven atenuados con etiqueta "Agotado" y no se abren
- Tocar un plato abre la hoja de detalle

### 2. Hoja de detalle del plato (modal desde abajo)
- Foto grande, botón cerrar, nombre y descripción
- Grupos de modificadores con etiqueta "Obligatorio" u "Opcional":
  - un solo valor obligatorio → radio; si no → checkboxes respetando el máximo
  - precio extra visible (+₡600)
- Nota de preparación (máx. 200 caracteres)
- Selector de cantidad (1 a 20) y botón "Agregar · ₡total" que recalcula en vivo
- Si falta un grupo obligatorio: mensaje "Elija una opción" bajo ese grupo, desplazarse
  hasta él y no agregar
- Cerrar con la X, tocando fuera o con Escape; enfoque atrapado dentro del modal

### 3. Carrito (/m/:token/carrito)
- Encabezado con flecha atrás y "Mi carrito"
- Tarjetas: foto, nombre, modificadores, "Nota de preparación" en amarillo (agregar/editar
  en línea), botones − y +, ícono de basurero rojo y subtotal del ítem
- Si el mismo plato con los mismos modificadores y nota se agrega otra vez, se suma la cantidad
- Resumen: subtotal, servicio (10%), total y la leyenda "Los precios incluyen IVA (13%)".
  Usar la función de cálculo de totales de packages/shared; aclarar que es un estimado y que
  el total oficial lo da el servidor
- Botón "Enviar pedido · ₡total": genera un clientRequestId (uuid), se deshabilita y muestra
  "Enviando…"; si falla la red, reintenta con el MISMO clientRequestId
- Al enviar con éxito: vaciar carrito, ir a "Mi cuenta" y mostrar aviso
- Carrito vacío: mensaje y botón "Ver el menú"

### 4. Mi cuenta (/m/:token/cuenta)
- Tarjeta por pedido (el más reciente arriba): número, hora, pastilla de estado,
  barra de 5 pasos (Enviado, Confirmado, En preparación, Listo, Entregado; verde al estar listo),
  ítems con modificadores y notas, y aviso amarillo "Esperando que el mesero confirme su pedido"
  cuando esté pendiente
- Resumen con el total de la mesa que devuelve el servidor
- Botones "Llamar al mesero" y "Pedir la cuenta" (este último queda deshabilitado una vez pedido)
  y "Pedir algo más"
- Cuando la cuenta se cierra (410 o evento cuenta:cerrada): pantalla de agradecimiento,
  borrar sesión y carrito

### Navegación inferior fija
Menú · Carrito (insignia con cantidad de ítems) · Mi cuenta (insignia con pedidos sin entregar)

## Datos y tiempo real
- Al entrar a /m/:token: GET /public/mesa/:token → guardar el token de sesión;
  luego GET /public/:slug/menu
- Guardar sesión, carrito e idioma en localStorage SIEMPRE dentro de try/catch;
  la app debe funcionar aunque localStorage no esté disponible
- Conectar socket.io con el token de sesión y escuchar:
  pedido:confirmado, pedido:cancelado, item:estado, cuenta:actualizada, cuenta:cerrada,
  menu:actualizado (refrescar menú y marcar en el carrito los platos que se agotaron)
- Al reconectar el socket o volver a la pestaña, refrescar GET /public/cuenta
- Ignorar eventos con updatedAt más viejo que el dato que ya se tiene
- Avisos (toast) breves: "Agregado al carrito", "Pedido enviado", "El mesero ya viene",
  "Pedido #N: Listo"
- Indicador discreto cuando no hay conexión

## Idiomas
- Español (por defecto) e inglés, con un archivo de textos por idioma; ningún texto quemado
  en los componentes
- Los nombres y descripciones de platos vienen de la API (nombreEs/nombreEn)
- Precios en colones con el símbolo ₡ y separador de miles (₡4 800). Si el restaurante
  usa USD, mostrar $ con dos decimales

## Estados obligatorios
- Cargando: esqueletos con la forma de las tarjetas (no spinners en pantalla completa)
- QR inválido o mesa inactiva: pantalla de error amigable
- Restaurante cerrado: banner informativo y botón de agregar deshabilitado
- Error al enviar: mensaje claro y botón para reintentar

## Accesibilidad y rendimiento
- Botones de al menos 44×44 px, foco visible, etiquetas aria en botones de solo ícono
- Respetar prefers-reduced-motion
- Imágenes con lazy loading, tamaño fijo para evitar saltos, formato WebP cuando venga de la API
- Meta de carga: menú visible en menos de 2 segundos en 3G rápido; revisar el tamaño del bundle
- Configurar como PWA básica (manifest e ícono; sin service worker de caché por ahora)

## Componentes sugeridos
AppShell, BottomNav, Header, SearchBar, PromoBanner, CategoryGrid, DishCard, DishSheet,
ModifierGroup, QuantityStepper, CartItem, NoteEditor, TotalsSummary, OrderCard, StatusSteps,
Toast, Skeletons, ErrorScreen, ThankYouScreen

## Forma de trabajar
1. Muéstrame un plan breve con la lista de componentes y rutas. Espera mi aprobación.
2. Primero los tokens de diseño y el AppShell; luego Menú → Detalle → Carrito → Mi cuenta
   → tiempo real → estados de error y carga.
3. Prueba contra la API local con los datos del seed (Soda La Esquina) y corrige errores
   de TypeScript y lint antes de cada paso siguiente.
4. Agrega tests con Vitest + Testing Library para: validación de modificadores, cálculo
   del carrito, fusión de ítems iguales y reintento con el mismo clientRequestId.

## Criterios de aceptación
- Abro /m/<token-de-la-mesa-5> en el celular y la app se ve igual al prototipo en modo
  claro y oscuro.
- Puedo agregar un casado con bistec solo si elijo el término, poner una nota, cambiar
  cantidades y enviar el pedido.
- El pedido aparece en "Mi cuenta" y su estado cambia en vivo cuando cocina lo actualiza
  desde la app del personal.
- Si se agota un plato mientras estoy en el menú, se actualiza sin recargar.
- Al cerrar la cuenta en caja, mi celular muestra la pantalla de agradecimiento.
