#!/usr/bin/env bash
# RetoPA — Deja retopa-dev igual a producción: CÓDIGO (mismo árbol y mismo commit),
# BASE (copia de prod, anonimizada ANTES de ponerla en uso) e IMÁGENES de las fichas.
# Corre en un nodo del clúster LXD (donde funciona `lxc exec`). No necesita red entre VMs.
#
#   ./sync-dev-desde-prod.sh plan     ← solo mira y reporta (no cambia nada en ningún lado)
#   ./sync-dev-desde-prod.sh apply    ← snapshot de dev y sincroniza
#
# Qué NO toca en dev: .env (secretos de dev), crontab, certbot, red, node_modules.
# Producción: solo lectura (pg_dump, tar de /opt/retopa e imágenes).
# Seguridad de la base: la copia se restaura en una base APARTE (retopa_sync), se anonimiza
# y verifica ahí; recién con 0 fugas se intercambia con la de dev. Si algo falla, la base
# aparte se borra y el dump se destruye. La base vieja de dev queda como retopa_predev_<fecha>.
set -Eeuo pipefail

MODE=${1:-plan}
CORE=${CORE:-retopa-core}
DEV=${DEV:-retopa-dev}
APP=/opt/retopa
TS=$(date +%Y%m%d-%H%M%S)
STG=/root/sync-prod                      # staging dentro de retopa-dev
PROD_IP=${PROD_IP:-10.10.50.10}
LXC=(lxc); [ -n "${LXC_PROJECT:-}" ] && LXC+=(--project "$LXC_PROJECT")

# stdin: si es la terminal, no se pasa (lxc no se come lo que tipeás); si es un pipe, sí.
core() { if [ -t 0 ]; then "${LXC[@]}" exec "$CORE" -T -- bash -c "$1" </dev/null; else "${LXC[@]}" exec "$CORE" -T -- bash -c "$1"; fi; }
dev()  { if [ -t 0 ]; then "${LXC[@]}" exec "$DEV"  -T -- bash -c "$1" </dev/null; else "${LXC[@]}" exec "$DEV"  -T -- bash -c "$1"; fi; }
say()  { printf '\n\033[1m── %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mABORTADO: %s\033[0m\n' "$*" >&2; exit 1; }

# Exclusiones del código (mismas para tar y rsync): secretos, dependencias, datos y volcados.
TAR_EX="--exclude=./.env --exclude='./.env.*' --exclude=node_modules --exclude=./backups --exclude=./data --exclude='*.log' --exclude='./scripts/*.json' --exclude='*.csv' --exclude='*.dump'"
RSYNC_EX="--exclude=/.env --exclude='/.env.*' --exclude=node_modules/ --exclude=/backups/ --exclude=/data/ --exclude='*.log' --exclude='/scripts/*.json' --exclude='*.csv' --exclude='*.dump'"
# Huella del árbol (para probar "misma versión"): mismo criterio de exclusión.
FP="cd $APP && find . -type f ! -path './.env' ! -path './.env.*' ! -path '*/node_modules/*' ! -path './backups/*' ! -path './data/*' ! -name '*.log' ! -path './scripts/*.json' ! -name '*.csv' ! -name '*.dump' -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16"
SQL_TABLES="SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema','tiger','tiger_data','topology') AND n.nspname NOT LIKE 'pg_%' ORDER BY 1"
# Conteo exacto por tabla (para comparar prod vs copia)
SQL_COUNTS="SELECT n.nspname||'.'||c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema','tiger','tiger_data','topology') AND n.nspname NOT LIKE 'pg_%' ORDER BY 1"
psql_in() { # $1 = core|dev, $2 = base, $3 = sql  → salida -At
  "$1" "docker exec -i retopa-db sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"$2\"'" <<<"$3"
}

# ── Guardas (siempre) ────────────────────────────────────────────────────────
say "Guardas"
[ "$(core hostname)" = "retopa-core" ] || die "$CORE no se llama retopa-core"
[ "$(dev hostname)"  = "retopa-dev"  ] || die "$DEV no se llama retopa-dev"
dev "ip -4 -o addr" | grep -q " $PROD_IP/" && die "retopa-dev tiene la IP de producción ($PROD_IP)"
if dev "crontab -l 2>/dev/null" | grep -Eq '^[^#].*(docker exec retopa-backend|/opt/bf)'; then
  die "retopa-dev tiene jobs de cron activos que mandan correos/mensajes (ver runbook, paso 3)"; fi
dev "command -v rsync >/dev/null" || die "falta rsync en retopa-dev (apt install rsync)"
PDB=$(core "docker exec retopa-db printenv POSTGRES_DB"); DDB=$(dev "docker exec retopa-db printenv POSTGRES_DB")
[ "$PDB" = "$DDB" ] || die "POSTGRES_DB distinto (prod=$PDB, dev=$DDB)"
echo "OK: $CORE = retopa-core · $DEV = retopa-dev (sin IP de prod, sin cron activo) · base '$PDB'"

# ── PLAN ─────────────────────────────────────────────────────────────────────
say "Código"
echo "prod: $(core "cd $APP && git log -1 --format='%h %cs %s' 2>/dev/null || echo 'sin git'")  · huella $(core "$FP")"
echo "dev : $(dev  "cd $APP && git log -1 --format='%h %cs %s' 2>/dev/null || echo 'sin git'")  · huella $(dev "$FP")"
echo "prod sin commitear: $(core "cd $APP && git status --porcelain 2>/dev/null | wc -l") archivos"
dev "rm -rf $STG/code && mkdir -p $STG/code && chmod 700 $STG"
core "tar -C $APP $TAR_EX -cf - ." | dev "tar -C $STG/code -xf -"
CH=$(dev "rsync -rlcn --delete --itemize-changes $RSYNC_EX $STG/code/ $APP/ | grep -v '/\$' || true")
echo "Cambiarían en dev: $(grep -c '^>f' <<<"$CH" || true) archivos · se borrarían (solo existen en dev): $(grep -c '^\*deleting' <<<"$CH" || true)"
grep '^\*deleting' <<<"$CH" | grep -v '^\*deleting .*\.git/' | sed 's/^\*deleting /   − /' | head -40 || true
PIIF=$(dev "cd $APP && find . -path ./node_modules -prune -o -path '*/node_modules' -prune -o -type f \( -path './scripts/*.json' -o -name '*.csv' -o -name '*.dump' \) -print" | xargs)
[ -n "$PIIF" ] && echo "Archivos de datos en dev fuera de la base (pueden tener contactos reales; apply los borra de dev): $PIIF"
say ".env (solo NOMBRES de variables, nunca valores)"
KP=$(core "grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' $APP/.env | sort -u"); KD=$(dev "grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' $APP/.env | sort -u")
MISS=$(LC_ALL=C comm -23 <(LC_ALL=C sort <<<"$KP") <(LC_ALL=C sort <<<"$KD") | tr -d '=' | xargs)
EXTRA=$(LC_ALL=C comm -13 <(LC_ALL=C sort <<<"$KP") <(LC_ALL=C sort <<<"$KD") | tr -d '=' | xargs)
echo "Faltan en dev: ${MISS:-ninguna}"; echo "Solo en dev:   ${EXTRA:-ninguna}"

say "Base"
echo "prod: $(psql_in core "$PDB" "SELECT pg_size_pretty(pg_database_size(current_database()))")   dev: $(psql_in dev "$DDB" "SELECT pg_size_pretty(pg_database_size(current_database()))")"
TP=$(psql_in core "$PDB" "$SQL_TABLES"); TD=$(psql_in dev "$DDB" "$SQL_TABLES")
DEVONLY=$(LC_ALL=C comm -13 <(LC_ALL=C sort <<<"$TP") <(LC_ALL=C sort <<<"$TD") | xargs)
echo "Tablas que solo existen en dev (se conservan, copiadas a la base nueva): ${DEVONLY:-ninguna}"
SQL_COLS="SELECT table_schema||'.'||table_name||'.'||column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema','tiger','tiger_data','topology') ORDER BY 1"
CP=$(psql_in core "$PDB" "$SQL_COLS"); CD=$(psql_in dev "$DDB" "$SQL_COLS")
COLONLY=$(LC_ALL=C comm -13 <(LC_ALL=C sort <<<"$CP") <(LC_ALL=C sort <<<"$CD") | grep -vF -f <(tr ' ' '\n' <<<"${DEVONLY:-@@}" | sed 's/$/./') | xargs || true)
echo "Columnas agregadas en dev a tablas de prod (NO pasan a la base nueva; quedan en la vieja): ${COLONLY:-ninguna}"
echo "Espacio libre en dev: $(dev "df -h / | awk 'NR==2{print \$4}'")  (hace falta ~2× el tamaño de prod)"

say "Imágenes de las fichas (volumen uploads/images)"
VOLP=$(core "docker inspect retopa-backend --format '{{range .Mounts}}{{if eq .Destination \"/uploads\"}}{{.Source}}{{end}}{{end}}'")
VOLD=$(dev  "docker inspect retopa-backend --format '{{range .Mounts}}{{if eq .Destination \"/uploads\"}}{{.Source}}{{end}}{{end}}'")
[ -n "$VOLP" ] && [ -n "$VOLD" ] || die "no encontré el volumen /uploads del backend"
echo "prod: $(core "du -sh $VOLP/images 2>/dev/null | cut -f1") ($(core "find $VOLP/images -type f | wc -l") archivos)   dev: $(dev "du -sh $VOLD/images 2>/dev/null | cut -f1")"
OTHER=$(core "cd $VOLP && ls -1 | grep -vx images || true" | xargs)
[ -n "$OTHER" ] && echo "Otras carpetas en uploads (NO se copian; pueden tener datos privados): $OTHER"

if [ "$MODE" != "apply" ]; then
  say "Fin del PLAN. No se cambió nada (solo se copió el código de prod a $STG en dev, para comparar)."
  echo "Para aplicar:  $0 apply"
  exit 0
fi

# ── APPLY ────────────────────────────────────────────────────────────────────
say "APPLY: vas a reemplazar código, base e imágenes de retopa-dev por los de producción"
if [ "${YES:-}" != "1" ]; then
  read -r -p "Escribí SINCRONIZAR para seguir: " ok; [ "$ok" = "SINCRONIZAR" ] || die "cancelado"; fi

SNAP="pre-sync-$TS"
"${LXC[@]}" snapshot "$DEV" "$SNAP"
echo "Snapshot de dev: $DEV/$SNAP   (rollback total:  lxc restore $DEV $SNAP)"

cleanup_fail() {
  printf '\n\033[31mFALLÓ. Limpiando la copia de prod en dev…\033[0m\n' >&2
  dev "shred -u $STG/prod.dump 2>/dev/null; rm -f $STG/prod.dump" || true
  psql_in dev postgres "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='retopa_sync'; DROP DATABASE IF EXISTS retopa_sync;" >/dev/null || true
  echo "Dev puede haber quedado a medias: volvé con  lxc restore $DEV $SNAP" >&2
}
trap cleanup_fail ERR

say "1/8 Parar la app de dev (queda la base y redis)"
dev "cd $APP && docker compose stop backend frontend nginx"

say "2/8 Código: dev = prod (incluye .git → mismo commit)"
dev "rsync -ac --delete $RSYNC_EX $STG/code/ $APP/"
for f in $PIIF; do dev "rm -f '$APP/$f'"; echo "   borrado de dev: $f (el original sigue en prod/NAS)"; done
[ "$(core "$FP")" = "$(dev "$FP")" ] || { echo "huellas distintas" >&2; false; }
echo "Huella idéntica: $(dev "$FP")"

say "3/8 Copia de la base de prod → dev (archivo 600, se destruye al terminar)"
dev "mkdir -p $STG && chmod 700 $STG && rm -f $STG/prod.dump"
COUNTS_P=$(psql_in core "$PDB" "$SQL_COUNTS")     # antes del dump: la copia tiene que tener ≥ filas
core "docker exec retopa-db sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc'" | dev "umask 077; cat > $STG/prod.dump"
dev "docker exec -i retopa-db pg_restore -l < $STG/prod.dump >/dev/null"   # el archivo está entero
echo "dump: $(dev "du -h $STG/prod.dump | cut -f1")"

say "4/8 Restaurar en una base APARTE (retopa_sync)"
psql_in dev postgres "DROP DATABASE IF EXISTS retopa_sync; CREATE DATABASE retopa_sync TEMPLATE template0;" >/dev/null
dev "docker exec -i retopa-db sh -c 'pg_restore -U \"\$POSTGRES_USER\" -d retopa_sync --no-owner --role=\"\$POSTGRES_USER\"' < $STG/prod.dump > $STG/restore.log 2>&1 || true"
dev "shred -u $STG/prod.dump"
echo "avisos de pg_restore: $(dev "grep -c 'error' $STG/restore.log || true")  (detalle: $STG/restore.log)"
COUNTS_S=$(psql_in dev retopa_sync "$SQL_COUNTS")
CMP=$(LC_ALL=C join -t'|' -a1 -e MISSING -o 0,1.2,2.2 <(LC_ALL=C sort <<<"$COUNTS_P") <(LC_ALL=C sort <<<"$COUNTS_S"))
BAD=$(awk -F'|' '$3=="MISSING" || ($2>0 && $3==0)' <<<"$CMP")
LESS=$(awk -F'|' '$3!="MISSING" && $3+0 < $2+0' <<<"$CMP")
[ -z "$LESS" ] || { echo "Aviso — tablas con menos filas que antes del dump (borradas en prod mientras tanto):"; echo "$LESS"; }
[ -z "$BAD" ] || { echo "Tablas que no quedaron bien (tabla|prod|copia):"; echo "$BAD"; false; }
echo "Conteos OK: $(echo "$COUNTS_P" | wc -l) tablas"

say "5/8 Conservar las tablas que solo existían en dev"
for t in $DEVONLY; do
  s=${t%%.*}
  psql_in dev retopa_sync "CREATE SCHEMA IF NOT EXISTS \"$s\";" >/dev/null
  dev "docker exec retopa-db sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"$DDB\" -t \"$t\" --no-owner' | docker exec -i retopa-db sh -c 'psql -X -q -U \"\$POSTGRES_USER\" -d retopa_sync'" >/dev/null
  echo "   + $t"
done

say "6/8 Anonimizar retopa_sync (si queda UN dato real, aborta)"
dev "cd $APP && DB_NAME=retopa_sync bash scripts/anonimizar-dev.sh"

say "7/8 Intercambio: retopa_sync → $DDB  (la vieja queda como retopa_predev_${TS//-/_})"
OLD="retopa_predev_${TS//-/_}"
psql_in dev postgres "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$DDB','retopa_sync') AND pid <> pg_backend_pid();" >/dev/null
psql_in dev postgres "ALTER DATABASE \"$DDB\" RENAME TO \"$OLD\";" >/dev/null
psql_in dev postgres "ALTER DATABASE retopa_sync RENAME TO \"$DDB\";" >/dev/null
trap - ERR
dev "docker exec retopa-redis redis-cli FLUSHALL >/dev/null"
echo "Base cambiada. Caché de redis vaciado."

say "8/8 Imágenes + rebuild"
core "tar -C $VOLP -cf - images" | dev "tar -C $VOLD -xf -"
dev "cd $APP && docker compose up -d --build"
for i in $(seq 1 30); do dev "curl -fsS -o /dev/null http://127.0.0.1/api/v2/cities" && break; sleep 4; done
dev "curl -fsS http://127.0.0.1/api/v2/cities | head -c 80"; echo
dev "rm -rf $STG/code"
say "LISTO"
echo "Código: $(dev "cd $APP && git log -1 --format='%h %s'")  (huella $(dev "$FP"))"
echo "Probá https://dev.retopa.com.py (contraseña de cualquier usuario: RetoPA-Dev-2026)."
echo "Cuando estés conforme (unos días):"
echo "   lxc exec $DEV -- docker exec retopa-db psql -U retopa -d postgres -c 'DROP DATABASE \"$OLD\"'"
echo "   lxc delete $DEV/$SNAP"
