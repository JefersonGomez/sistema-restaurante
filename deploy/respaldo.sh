#!/usr/bin/env bash
# Respaldo diario (cron del VPS): base de datos e imágenes subidas; se guardan 14 días.
set -euo pipefail
umask 077 # los respaldos tienen datos de los restaurantes: solo root
BASE=/opt/kitchago
DESTINO=$BASE/respaldos
FECHA=$(date +%F)
mkdir -p "$DESTINO"
cd "$BASE/src"
docker compose -f deploy/docker-compose.yml --env-file "$BASE/.env" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$DESTINO/kitchago-$FECHA.sql.gz"
tar -czf "$DESTINO/imagenes-$FECHA.tar.gz" -C "$BASE" uploads
find "$DESTINO" -type f -mtime +14 -delete
