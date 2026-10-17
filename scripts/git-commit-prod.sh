#!/usr/bin/env bash
# Commitea en retopa-core lo que está APLICADO en producción (/opt/retopa).
# No hace push: lo hacés vos después de mirar el commit (git show --stat).
# Guardas: no sigue si GitHub tiene commits que prod no tiene, ni si entra al commit
# un .env, un volcado, datos de contactos (scripts/*.json, *.csv), node_modules o algo
# con pinta de secreto. _deploy/ queda afuera (pendiente: moverlo a docs/historico).
set -euo pipefail
[ "$(hostname)" = "retopa-core" ] || { echo "ABORTADO: correr en retopa-core" >&2; exit 1; }
cd /opt/retopa
BR=$(git rev-parse --abbrev-ref HEAD)
if git fetch -q origin 2>/dev/null; then
  B=$(git rev-list --count "HEAD..origin/$BR" 2>/dev/null || echo 0)
  [ "$B" = 0 ] || { echo "PARÁ: origin/$BR tiene $B commit(s) que prod no tiene (git log HEAD..origin/$BR)." >&2; exit 1; }
else
  echo "Aviso: no pude hacer fetch (¿llave SSH de GitHub en esta máquina?). Sigo con el commit local."
fi
git add -A -- . ':(exclude)_deploy' ':(exclude)*.tar.gz'
BADF=$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.)|\.dump$|\.sql\.gz$|^scripts/[^/]*\.json$|\.csv$|(^|/)node_modules/|\.pem$|\.key$|id_(rsa|ed25519)' || true)
if [ -n "$BADF" ]; then echo "PARÁ: estos archivos no van al repo:" >&2; echo "$BADF" >&2; git reset -q; exit 1; fi
SEC=$(git diff --cached -U0 -- . ':(exclude)tests/**' | grep -E '^\+[^+]' \
      | grep -Ei '(password|passwd|secret|api[_-]?key|access[_-]?token)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"'$ ]{12,}|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|EAA[A-Za-z0-9]{40,}' \
      | grep -E '[0-9]|PRIVATE KEY' | grep -vE 'harness-secret|process\.env|\$2b\$10\$oCtsUdsl40hx4Hs9j2vnQ' || true)
if [ -n "$SEC" ]; then echo "PARÁ: posibles secretos en el diff:" >&2; echo "$SEC" | cut -c1-160 | head -20 >&2; git reset -q; exit 1; fi
# Datos personales en TODO lo que se va a subir (commits sin push + lo de ahora), fuera de tests/.
BASE=$(git rev-parse -q --verify "origin/$BR" || git rev-parse HEAD)
RX="(\+?595|[^0-9]0)[ .-]?9[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{3}|'9[0-9]{8}'|@[A-Za-z0-9-]+\.[a-z]{2,}"
SKIP='@dev\.invalid|@retopa\.com\.py|@ejemplo\.com|@email\.com|@example\.|@x\.com|@anthropic\.com|123 456|1234567|000000|0900|\+595 900|9XXXXXXXX|type="email"'
PII=$(git diff --cached "$BASE" -- . ':(exclude)tests/**' | awk '/^\+\+\+ b\//{f=substr($2,3); next} /^\+/{print f": "substr($0,2)}' \
      | grep -E "$RX" | grep -vE "$SKIP" || true)
if [ -n "$PII" ] && [ "${PII_OK:-}" != "1" ]; then
  echo "PARÁ: parecen celulares o correos reales en lo que se va a subir:" >&2
  echo "$PII" | cut -c1-160 | head -30 >&2
  echo "Sacalos (o parametrizalos). Si de verdad son públicos/de RetoPA:  PII_OK=1 bash $0" >&2
  git reset -q; exit 1
fi
N=$(git diff --cached --name-only | wc -l)
[ "$N" -gt 0 ] || { echo "Nada para commitear: el repo ya está igual a producción."; exit 0; }
LAST=$(git log -1 --format=%cI)
PKGS=$(find _deploy -maxdepth 1 -name 'DEPLOY_*.txt' -newermt "$LAST" -printf '%f\n' 2>/dev/null | sed 's/^DEPLOY_//; s/\.txt$//' | sort | paste -sd, - | sed 's/,/, /g')
git commit -q -F - <<MSG
Producción al $(date +%F): paquetes aplicados desde el último commit

Paquetes (según _deploy/DEPLOY_*.txt posteriores a $(git log -1 --format=%h)): ${PKGS:-ver git diff}
$N archivos. Incluye scripts/anonimizar-dev v2 y scripts/sync-dev-desde-prod.sh.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UJyKHiik27jt1q5QUv3Ms5
MSG
echo "Commits que se van a subir:"; git --no-pager log --oneline "$BASE..HEAD"
echo; echo "TODOS los archivos que se van a subir:"; git --no-pager diff --stat=120 "$BASE" HEAD | cat
echo
echo "Mirá la lista entera. Si está bien:   cd /opt/retopa && git push origin $BR"
