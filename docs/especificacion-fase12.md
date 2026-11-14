# Fase 12 — Landing de KitchaGo y logo animado

Pedido del usuario (2026-11-13): "para el diseño de la landing page guíate del recurso que dejé en
`prototipo_front` … ya tengo el logo … que quede bonita, es para restaurantes, agrégale
animaciones. Y el logo de la cuchara y el cuchillo quiero que lo cambies al logo, igual con una
animación, como que cae el sombrero".

Recursos: `prototipo_front/05 · Gorro listo@1x logo.png` (logo: gorro de chef con check, la
palabra "kitcha" con "go" en coral) y `prototipo_front/ladingPAGE.webp` (referencia de estilo: hero
oscuro, franjas retro rojo/naranja/amarillo, ilustraciones de línea, tarjetas con borde punteado,
secciones blancas). Se toma el estilo como inspiración con los colores de la marca y contenido
propio para restaurantes; no se copia esa página.

## Logo

- Gorro de KitchaGo en SVG (componente compartido), coral #FF6F4F con el check oscuro.
- **Animación de carga** (reemplaza tenedor y cuchillo en menú del cliente y panel): la banda se
  dibuja, el gorro cae desde arriba girando, rebota al asentarse y el check se dibuja. En bucle.
  Con "reducir movimiento" queda quieto.
- Favicon del panel y del menú con el gorro.

## Landing (`apps/landing`, puerto 5182)

Página estática (Vite, sin librerías nuevas) en español para dueños de restaurantes y sodas:
hero oscuro con el logo animado, titular, botones "Probar 30 días gratis" (→ registro del panel) y
"Entrar", ilustración de línea animada (celular con QR → pantalla de cocina con comandas), franjas
retro con los colores de la marca, "Cómo funciona" (3 pasos), funciones (cocina, mesero, caja,
en línea con SINPE, domicilio, clientes y sellos, reportes, sin internet), "0 % comisión por
pedido", planes (Básico ₡9 900, Completo ₡19 900, anual con 2 meses gratis, 30 días de prueba),
preguntas frecuentes, llamada final y pie. Animaciones al entrar y al bajar (sin dejar nada
oculto si el JS no corre), respetando "reducir movimiento". Debe verse bien en celular.

Variable nueva: `VITE_PANEL_URL` (base del panel para los botones; por defecto
`http://localhost:5181`).

## Fuera de alcance

Formulario de contacto con envío, blog, páginas legales publicadas (pendiente de que el usuario
complete los textos), dominio.

## Plan

1. **12.1** Logo en SVG, animación de carga y favicons.
2. **12.2** Landing.
