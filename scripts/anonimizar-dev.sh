#!/usr/bin/env bash
# Anonimiza los datos de contacto de una copia de producción. SOLO corre en retopa-dev.
# v2 (2026-10-17): el SQL vive en anonimizar-dev.sql (explícito + barrido genérico de
# todas las columnas + verificación que aborta con ERROR si queda algo real).
# Uso:  scripts/anonimizar-dev.sh                 (base de la app, la del .env)
#       DB_NAME=retopa_sync scripts/anonimizar-dev.sh   (otra base del mismo servidor)
set -euo pipefail

H=$(hostname)
if [ "$H" != "retopa-dev" ]; then
  echo "ABORTADO: solo corre en retopa-dev (hostname actual: $H)" >&2
  exit 1
fi

DIR=$(cd "$(dirname "$0")" && pwd)
CONT=${DB_CONT:-retopa-db}
U=${DB_USER:-$(docker exec "$CONT" printenv POSTGRES_USER)}
D=${DB_NAME:-$(docker exec "$CONT" printenv POSTGRES_DB)}
echo "Anonimizando la base '$D' en $CONT…"
docker exec -i "$CONT" psql -X -v ON_ERROR_STOP=1 -U "$U" -d "$D" < "$DIR/anonimizar-dev.sql"
