#!/usr/bin/env bash
# Respaldo diario (cron del VPS): base de datos e imágenes subidas; se guardan 14 días en el VPS.
# Fase 22: además se cifran (AES-256, clave RESPALDO_CLAVE de /opt/kitchago/.env) y se suben a
# Backblaze B2, para no perder todo si el VPS falla. Restaurar: ver README ("Respaldos").
set -euo pipefail
umask 077 # los respaldos tienen datos de los restaurantes: solo root
BASE=/opt/kitchago
DESTINO=$BASE/respaldos
FECHA=$(date +%F)
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file "$BASE/.env")
mkdir -p "$DESTINO"
cd "$BASE/src"
"${COMPOSE[@]}" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$DESTINO/kitchago-$FECHA.sql.gz"
tar -czf "$DESTINO/imagenes-$FECHA.tar.gz" -C "$BASE" uploads
find "$DESTINO" -type f -name '*.gz' -mtime +14 -delete

RESPALDO_CLAVE=$(grep -E '^RESPALDO_CLAVE=' "$BASE/.env" | cut -d= -f2- || true)
if [ -z "$RESPALDO_CLAVE" ]; then
  echo "$(date -Is) Sin RESPALDO_CLAVE: los respaldos quedan solo en el VPS."
  exit 0
fi
export RESPALDO_CLAVE
for archivo in "kitchago-$FECHA.sql.gz" "imagenes-$FECHA.tar.gz"; do
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:RESPALDO_CLAVE \
    -in "$DESTINO/$archivo" |
    "${COMPOSE[@]}" exec -T api pnpm exec tsx scripts/subir-respaldo.ts "$archivo.enc"
done
echo "$(date -Is) Respaldo $FECHA listo."
