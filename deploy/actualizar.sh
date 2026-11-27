#!/usr/bin/env bash
# Corre en el VPS después de copiar el código a /opt/kitchago/src: construye la web, la cambia de
# una vez y levanta la base de datos y la API (que aplica las migraciones al arrancar).
set -euo pipefail
DOMINIO=kitchago.com
BASE=/opt/kitchago
# Corrido a mano: toma el mismo candado que desplegar.sh (que ya lo tiene y avisa con la variable).
if [ -z "${KITCHAGO_CANDADO:-}" ]; then
  exec 9>"$BASE/.despliegue.lock"
  flock -n 9 || { echo "Ya hay un despliegue en curso; espere a que termine." >&2; exit 1; }
fi
cd "$BASE/src"

docker build -f deploy/Dockerfile.web \
  --build-arg VITE_API_URL="https://api.$DOMINIO" \
  --build-arg VITE_PANEL_URL="https://panel.$DOMINIO" \
  --output type=local,dest="$BASE/www.nuevo" .
chmod -R a+rX "$BASE/www.nuevo"
rm -rf "$BASE/www.anterior"
[ -d "$BASE/www" ] && mv "$BASE/www" "$BASE/www.anterior"
mv "$BASE/www.nuevo" "$BASE/www"

mkdir -p "$BASE/uploads"
docker compose -f deploy/docker-compose.yml --env-file "$BASE/.env" up -d --build
docker image prune -f >/dev/null
echo "Listo: https://$DOMINIO"
