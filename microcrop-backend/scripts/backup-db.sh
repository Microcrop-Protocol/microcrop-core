#!/bin/bash
# Usage: ./scripts/backup-db.sh
# Requires: pg_dump, DATABASE_URL env var
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="$BACKUP_DIR/microcrop_${TIMESTAMP}.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILENAME"
echo "Backup saved to $FILENAME"
# Cleanup: keep last 7 days
find "$BACKUP_DIR" -name "microcrop_*.sql.gz" -mtime +7 -delete
echo "Old backups cleaned up"
