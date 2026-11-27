#!/usr/bin/env bash
# Desde la computadora (Git Bash): sube lo que está en el último commit al VPS y lo actualiza.
#   bash deploy/desplegar.sh
set -euo pipefail
SERVIDOR=${SERVIDOR:-root@169.58.105.198}
LLAVE=${LLAVE:-$HOME/.ssh/cubivo_vps}
SSH=(ssh -i "$LLAVE" -o BatchMode=yes "$SERVIDOR")

git archive --format=tar HEAD | "${SSH[@]}" \
  'rm -rf /opt/kitchago/src.nuevo && mkdir -p /opt/kitchago/src.nuevo \
   && tar -x -C /opt/kitchago/src.nuevo \
   && rm -rf /opt/kitchago/src && mv /opt/kitchago/src.nuevo /opt/kitchago/src'
"${SSH[@]}" 'bash /opt/kitchago/src/deploy/actualizar.sh'
