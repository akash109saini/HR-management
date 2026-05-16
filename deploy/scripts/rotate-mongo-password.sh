#!/usr/bin/env bash
# ============================================================
# Rotate the HRMS backend's MongoDB password.
#
# Usage:
#   ./rotate-mongo-password.sh <username> <new_password>
#
# It will:
#   1) connect as the root user (from SECRETS.env)
#   2) update the password on the target user
#   3) print the new MONGO_URL to paste into backend/.env
# ============================================================
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <username> <new_password>"
  exit 1
 fi

USER="$1"
NEW_PASS="$2"

# shellcheck disable=SC1091
source "$(dirname "$0")/../mongo/SECRETS.env"

mongosh --quiet \
  --host "$MONGO_HOST" --port "$MONGO_PORT" \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" \
  --authenticationDatabase admin \
  --eval "db.getSiblingDB('${MONGO_DB}').changeUserPassword('${USER}', '${NEW_PASS}'); print('OK')"

echo
echo "Password rotated for user: $USER"
echo "New MONGO_URL (paste into backend/.env):"
echo "mongodb://${USER}:${NEW_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_DB}"
