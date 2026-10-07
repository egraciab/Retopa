#!/bin/bash

# =========================================================
# RETOPA Backup Script
# Backup completo de /opt/retopa
# Salida:
#   /opt/retopa/backups/
# =========================================================

set -e

SOURCE_DIR="/opt/retopa"
BACKUP_DIR="/home/hepta/backups"

DATE=$(date +"%Y%m%d_%H%M%S")
HOSTNAME=$(hostname)

BACKUP_FILE="retopa_backup_${HOSTNAME}_${DATE}.tar.gz"

echo "========================================="
echo " RETOPA BACKUP SCRIPT"
echo "========================================="
echo "Origen : $SOURCE_DIR"
echo "Destino: $BACKUP_DIR"
echo "Archivo: $BACKUP_FILE"
echo ""

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

# Ejecutar backup
tar \
  --exclude="$BACKUP_DIR" \
  --exclude="$SOURCE_DIR/.git" \
  --exclude="$SOURCE_DIR/backend/node_modules" \
  -czpf "$BACKUP_DIR/$BACKUP_FILE" \
  "$SOURCE_DIR"

echo ""
echo "✅ Backup completado:"
echo "$BACKUP_DIR/$BACKUP_FILE"

# Mostrar tamaño
du -sh "$BACKUP_DIR/$BACKUP_FILE"

echo "========================================="
