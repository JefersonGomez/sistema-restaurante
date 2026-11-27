# Despliegue en producción

Pedido del usuario (2026-11-26): "ya tengo el dominio y podemos pasar a desplegar". Dominio
**kitchago.com** (comprado en DonDominio). VPS **Contabo** `169.58.105.198`, Ubuntu 24.04, 8 GB de
RAM. "Revisa antes de entrar a la VPS porque hay otros proyectos desplegados."

## Lo que se encontró en el VPS (revisión de solo lectura, 2026-11-26)

- **nginx del sistema** ocupa los puertos 80 y 443 para otros 5 sitios (cubivo, portafolio, rifas,
  stockly, techrag), con certificados de Let's Encrypt (certbot con renovación automática).
- Proyectos en `/opt/` con Docker; stockly tiene su propio Caddy detrás de nginx (127.0.0.1:8080).
- Puertos internos ocupados: 3001, 3100, 6379 (redis), 8080, 8443.

**Decisión:** no se instala Caddy (habría chocado con nginx). KitchaGo se agrega al nginx existente
como un sitio más, con su propio archivo, y el HTTPS lo saca certbot. Nada de los otros proyectos se
modifica.

## Cómo queda

| Dirección             | Qué                       | Dónde en el VPS                        |
| --------------------- | ------------------------- | -------------------------------------- |
| `kitchago.com`, `www` | Landing                   | `/opt/kitchago/www/landing` (estático) |
| `menu.kitchago.com`   | Menú de los clientes (QR) | `/opt/kitchago/www/menu`               |
| `panel.kitchago.com`  | Panel del personal        | `/opt/kitchago/www/panel`              |
| `api.kitchago.com`    | API + Socket.IO           | contenedor en `127.0.0.1:4100`         |

- `/opt/kitchago/src`: el código (copiado del último commit con `deploy/desplegar.sh`).
- `/opt/kitchago/.env`: variables de producción (secretos generados en el servidor; nunca en el
  repo). La clave de Resend y la cédula del proveedor las pone el usuario.
- Base de datos propia (`kitchago-db-1`, Postgres 16 en Docker, volumen `kitchago_pgdata`), sin
  puerto hacia afuera.
- Imágenes subidas en `/opt/kitchago/uploads`.
- Respaldo diario (`deploy/respaldo.sh` en el cron): base de datos + imágenes en
  `/opt/kitchago/respaldos`, 14 días.
- Factura electrónica en **pruebas** de Hacienda hasta tener la llave de producción.

## Estado (2026-11-26)

Pasos 1–4 y 7 (respaldo) hechos por Claude con la llave SSH `~/.ssh/cubivo_vps` (usuario root):
contenedores `kitchago-db-1` y `kitchago-api-1` arriba, 31 migraciones aplicadas, sitio de nginx
probado con `nginx -t` antes de recargar, certificado `kitchago.com` (5 nombres), cron del
respaldo a las 3:30 y una corrida de prueba. Los otros sitios del VPS siguieron respondiendo
igual. Faltan los pasos 5 y 6 (los hace el usuario: llevan contraseña y clave).

## Pasos

1. DNS en DonDominio: registros A de `kitchago.com`, `www`, `menu`, `panel` y `api` →
   `169.58.105.198` (lo hace el usuario).
2. Subir el código, crear `.env`, construir y levantar (`deploy/desplegar.sh`).
3. Sitio de nginx (`deploy/nginx-kitchago.conf`), `nginx -t` y recarga.
4. Certificados: `certbot --nginx -d kitchago.com -d www.kitchago.com -d menu… -d panel… -d api…`.
5. Superadmin con `pnpm --filter api superadmin` (la contraseña la escribe el usuario).
6. Resend: verificar el dominio (registros DNS que da Resend) y poner `RESEND_API_KEY`.
7. Respaldo en el cron y prueba de punta a punta.
