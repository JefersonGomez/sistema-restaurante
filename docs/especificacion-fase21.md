# Fase 21 — Demo para probar KitchaGo

Pedido del usuario (2026-11-27): "quiero hacer una demo, para que se pruebe, obviamente desplegada,
como que en login haya una parte que diga probar demo y pues que tenga datos de prueba y todo."

Sobre `docs/mejoras-pendientes.md`: lo que lleva código ya está hecho (rastreo en vivo en la 17.3,
cortes cortos en la 18). Quedan solo recomendaciones sin código (router 4G) o descartadas
(servidor local).

Decisiones del usuario (misma fecha):

- **Una demo propia por visita:** cada visitante recibe su propio restaurante de prueba con datos
  de ejemplo. Nadie ve lo que hace otro. Se borra sola a las 24 h.
- **Elige el rol:** Dueño, Mesero, Cocina, Caja o Repartidor, y enlace al menú del cliente para
  pedir desde el celular. Dentro de la demo se puede cambiar de rol sin salir.
- **Botón "Probar demo"** en el login del panel y en la landing.
- **Límites** (se tomó la opción recomendada; el usuario no respondió esa pregunta): sin factura
  electrónica real, sin correos, sin cambiar contraseña. Lo demás funciona normal, con un aviso
  arriba "Está en una demo".

## Sub-fases

1. **21.1 API de la demo.** ✅
   - `Restaurante.esDemo` (migración). Los datos de ejemplo del seed (menú con fotos, mesas con
     pedidos en distintos estados, personal, pedidos en línea, historial de 30 días, clientes y
     sellos) pasan a un módulo que usan el seed y la API.
   - `POST /demo { rol }` (5 por IP cada hora): crea el restaurante demo ("Soda La Esquina", slug
     `demo-<10 hex>`, plan Completo, usuarios `<rol>.<sufijo>@demo.kitchago.invalid` con una
     contraseña al azar que nadie conoce) y deja la sesión iniciada con el rol pedido. Tope de 100
     demos vivas (`503 DEMOS_LLENAS`).
   - `POST /demo/rol { rol }`: cambia de rol dentro de la misma demo; `GET /demo`: vence,
     dirección del menú en línea y de la primera mesa libre. Fuera de una demo → 404 `NO_ES_DEMO`.
   - Cada hora se borran las demos con más de 24 h (con sus fotos subidas). Las fotos de ejemplo
     del menú son compartidas y no se borran.
   - Límites (`sinDemo`): guardar/probar Hacienda, enviar comprobante por correo y cambiar
     contraseña responden 403 `DEMO_NO_PERMITIDO`; "olvidé mi contraseña" no manda correo. El superadmin no ve las demos en su lista ni en sus números.
   - Tests.
2. **21.2 Pantallas.** ✅ Página `/demo` en el panel con los roles para elegir; sección "Probar demo"
   en el login; franja arriba en la demo ("Demo: se borra en X h · Ver como: … · Abrir menú del
   cliente · Crear mi cuenta"); botón "Probar demo" en la landing. Prueba en el navegador.
   Cambiar de rol recarga la página (la sesión nueva sale de la cookie). En la demo no sale el
   aviso del plan.
3. **21.3 Despliegue** en kitchago.com y prueba allí.

## Fuera de alcance

Guardar una demo para convertirla en cuenta real (el visitante se registra aparte), demos con otro
plan que no sea Completo, recorrido guiado paso a paso.
