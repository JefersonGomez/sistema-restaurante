# Fase 22 — Producción más segura y más visible

Pedido del usuario (2026-11-27): "en google sale, pero no sale el icono de kitchago, sale el
planeta tierra en blanco" y, de las mejoras propuestas, "vamos con el 1, 2, 3, 4, 5; luego te digo
qué hacer con el pago de mensualidad".

Decisiones del usuario (misma fecha):

- **Respaldos fuera del VPS en Backblaze B2** (10 GB gratis, sin tarjeta). Se cifran en el VPS
  antes de salir. El usuario crea la cuenta, el bucket privado y la llave de aplicación.
- **Monitoreo con UptimeRobot** (gratis, cada 5 min, aviso por correo y app). El usuario crea la
  cuenta; aquí se dejan las direcciones y los pasos.

## Sub-fases

1. **22.1 Ícono en Google y despliegues sin cruces.** ✅ `favicon.ico` (16/32/48), PNG de 192 y 512,
   `apple-touch-icon` y `robots.txt` en la landing (antes `/favicon.ico` devolvía el HTML).
   `desplegar.sh`/`actualizar.sh` con un candado (`flock`): si ya hay un despliegue corriendo, el
   segundo se detiene con un aviso en vez de cruzarse (lo que rompió el despliegue de la Fase 21).
2. **22.2 Vista previa al compartir.** ✅ Etiquetas Open Graph y Twitter en la landing y una imagen
   1200×630 con el logo y el mensaje principal, para WhatsApp, Facebook y Google.
3. **22.3 ¿La demo convierte?** ✅ Se cuentan las demos creadas por día (tabla propia: las demos se
   borran a las 24 h) y se marca el restaurante que se registra después de probar la demo
   (`vieneDeDemo`, lo sabe el navegador que entró a la demo). El superadmin ve en su resumen: demos
   de los últimos 30 días, registros que vinieron de la demo y el porcentaje.
4. **22.4 Respaldos fuera del VPS.** Código ✅; falta que el usuario cree el bucket y la llave. `respaldo.sh` cifra la base y las imágenes (AES-256 con
   `openssl`, clave en `/opt/kitchago/.env`, que el usuario guarda también fuera del VPS) y las sube
   a B2 con la librería S3 que la API ya usa. En B2 se guardan 30 días (regla del bucket). README
   con cómo restaurar. Necesita del usuario: keyID, applicationKey, nombre del bucket y endpoint.
5. **22.5 Aviso si el sitio se cae.** Pasos ✅ en el README; falta que el usuario cree los monitores. Monitores en UptimeRobot para la landing, el panel, el menú
   y `https://api.kitchago.com/health` (este revisa también la base de datos). Pasos en el README.

## Fuera de alcance

Cobro automático de la mensualidad (el usuario lo decide después), página de estado pública,
respaldo continuo (WAL) de la base.
