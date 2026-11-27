#!/usr/bin/env bash
# Desde la computadora (Git Bash): sube lo que está en el último commit al VPS y lo actualiza.
#   bash deploy/desplegar.sh
set -euo pipefail
SERVIDOR=${SERVIDOR:-root@169.58.105.198}
LLAVE=${LLAVE:-$HOME/.ssh/cubivo_vps}

# Todo en una sola conexión y con candado: si ya hay un despliegue corriendo, este se detiene
# (dos a la vez se pisan al cambiar las carpetas; pasó en la Fase 21).
git archive --format=tar HEAD | ssh -i "$LLAVE" -o BatchMode=yes "$SERVIDOR" \
  'exec 9>/opt/kitchago/.despliegue.lock
   flock -n 9 || { echo "Ya hay un despliegue en curso en el VPS; espere a que termine." >&2; exit 1; }
   rm -rf /opt/kitchago/src.nuevo && mkdir -p /opt/kitchago/src.nuevo \
   && tar -x -C /opt/kitchago/src.nuevo \
   && rm -rf /opt/kitchago/src && mv /opt/kitchago/src.nuevo /opt/kitchago/src \
   && KITCHAGO_CANDADO=1 bash /opt/kitchago/src/deploy/actualizar.sh'
