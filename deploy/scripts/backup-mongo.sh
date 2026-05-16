#!/usr/bin/env bash
# ============================================================
# Authenticated daily backup of the HRMS database.
# Cron example:  0 2 * * *  /app/deploy/scripts/backup-mongo.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../mongo/SECRETS.env"

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/hrms-mongo}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_ROOT/$STAMP"
mkdir -p "$OUT"

mongodump \
  --host "$MONGO_HOST" --port "$MONGO_PORT" \
  --username "$MONGO_READ_USER" --password "$MONGO_READ_PASS" \
  --authenticationDatabase "$MONGO_DB" \
  --db "$MONGO_DB" \
  --gzip --out "$OUT"

# Keep last 14 daily backups
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +

echo "Backup written to: $OUT"
