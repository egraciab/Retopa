#!/bin/bash
# RetoPA — Archivar migraciones viejas tras consolidar en schema.sql
# Correr UNA vez desde /opt/retopa/sql/
set -e
cd "$(dirname "$0")"
mkdir -p archive
echo "Moviendo migraciones numeradas y legacy a archive/ ..."
# Mueve todo lo que empiece con dígito + migrate_v2.2, PERO conserva schema.sql y seed.sql
for f in [0-9]*.sql migrate_v2.2.sql; do
  [ -e "$f" ] && mv -v "$f" archive/
done
echo ""
echo "Listo. Quedan en sql/:"
ls -1 *.sql 2>/dev/null
echo ""
echo "Archivadas en sql/archive/: $(ls -1 archive/*.sql 2>/dev/null | wc -l) archivos"
