#!/usr/bin/env bash
# Dengizek — günlük Postgres yedeği → Cloudflare R2.
#
# Gereksinimler (VPS'te bir kere): `aws` CLI kurulu olmalı (R2 S3-uyumlu).
# Kurulum sonrası crontab'a bkz. deploy/crontab.example.
#
# Kullanım: ./deploy/backup.sh
# (Bu script docker-compose.prod.yml'in yanındaki .env.production'ı okur.)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup] $ENV_FILE bulunamadı." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD .env.production dosyasinda tanimli olmali}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME tanımlı olmalı}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID tanımlı olmalı}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY tanımlı olmalı}"

R2_ENDPOINT_URL="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID:-}.r2.cloudflarestorage.com}"
if [[ "$R2_ENDPOINT_URL" == "https://.r2.cloudflarestorage.com" ]]; then
  echo "[backup] R2_ENDPOINT veya R2_ACCOUNT_ID tanımlı olmalı." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="/tmp/dengizek-${TIMESTAMP}.sql.gz"

echo "[backup] pg_dump alınıyor..."
docker exec dengizek-pg-prod pg_dump -U postgres -d dengizek | gzip > "$DUMP_FILE"

echo "[backup] R2'ye yükleniyor: s3://${R2_BUCKET_NAME}/backups/dengizek-${TIMESTAMP}.sql.gz"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp "$DUMP_FILE" "s3://${R2_BUCKET_NAME}/backups/dengizek-${TIMESTAMP}.sql.gz" \
  --endpoint-url "$R2_ENDPOINT_URL"

rm -f "$DUMP_FILE"
echo "[backup] Tamamlandı."
