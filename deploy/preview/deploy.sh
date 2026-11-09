#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Otelsayfam önizleme sunucusuna tek komutla dağıtım.
#
#   deploy/preview/deploy.sh
#
# Ortam değişkenleriyle değiştirilebilir:
#   DEPLOY_HOST  (varsayılan root@64.226.108.21)
#   DEPLOY_DIR   (varsayılan /opt/otelsayfam)
#   APP_URL      (varsayılan http://64.226.108.21:8080 — NEXT_PUBLIC_APP_URL)
#
# Adımlar: kodu rsync ile eşitler → sunucuda CPU/bellek sınırlı kapsayıcıda
# derler (sunucudaki diğer projeler yavaşlamasın) → çalışma imajını kurar →
# uygulamayı yeniden başlatır → sayfaları kontrol eder.
#
# Gizli değerler sunucuda kalır: $DEPLOY_DIR/.env (POSTGRES_PASSWORD) ve
# $DEPLOY_DIR/.env.production. Betik bunları oluşturmaz, değiştirmez, okumaz;
# yoksa durur. Kurulum ayrıntıları: deploy/README.md "Önizleme sunucusu".
# ---------------------------------------------------------------------------
set -euo pipefail

HOST="${DEPLOY_HOST:-root@64.226.108.21}"
DIR="${DEPLOY_DIR:-/opt/otelsayfam}"
APP_URL="${APP_URL:-http://64.226.108.21:8080}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH=(ssh -o ServerAliveInterval=30 -o ConnectTimeout=15 "$HOST")

step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

step "Sunucu ve gizli dosyalar kontrol ediliyor ($HOST:$DIR)"
"${SSH[@]}" "test -f '$DIR/.env' && test -f '$DIR/.env.production'" || {
  echo "Hata: $DIR/.env veya $DIR/.env.production yok. İlk kurulum için deploy/README.md'ye bakın." >&2
  exit 1
}

step "Kod eşitleniyor"
# Fotoğraflar (public/uploads), bağımlılıklar ve derleme çıktısı sunucuda kalır.
# macOS'un ._ dosyaları gönderilmez (derlemeyi bozuyorlar).
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude 'public/uploads' --exclude '.env*' \
  --exclude test-results --exclude 'eval-*.json' --exclude tsconfig.tsbuildinfo \
  --exclude '._*' --exclude .DS_Store \
  "$ROOT/apps/web/" "$HOST:$DIR/src/apps/web/"
rsync -az --exclude '._*' "$ROOT/deploy/preview/docker-compose.yml" "$ROOT/deploy/preview/Dockerfile.runtime" "$ROOT/deploy/preview/nginx.conf" "$HOST:$DIR/"
rsync -az --delete --exclude '._*' "$ROOT/deploy/piper/" "$HOST:$DIR/piper/"

step "Derleniyor (1 CPU, 3.5 GB bellek sınırıyla — birkaç dakika sürer)"
# Derleme sunucuda bağımsız bir kapsayıcıda çalışır; betik kısa bağlantılarla
# durumunu sorar. (Tek uzun SSH bağlantısı derleme sırasında kopabiliyordu.)
"${SSH[@]}" bash -s -- "$DIR" "$APP_URL" <<'REMOTE'
set -euo pipefail
DIR="$1"; APP_URL="$2"
cd "$DIR"
printf '*\n!apps/web/public\n!apps/web/.next/standalone\n!apps/web/.next/static\n' > src/.dockerignore
docker rm -f otelsayfam-build >/dev/null 2>&1 || true
docker run -d --name otelsayfam-build --cpus 1 -m 3500m \
  -v "$DIR/src/apps/web:/app" -w /app \
  -e NEXT_PUBLIC_APP_URL="$APP_URL" -e NEXT_TELEMETRY_DISABLED=1 -e NODE_OPTIONS=--max-old-space-size=3072 \
  node:22-alpine sh -c '
    # Bağımlılıklar yalnız package-lock.json değiştiyse yeniden kurulur.
    LOCK="$(sha256sum package-lock.json | cut -d" " -f1)"
    if [ ! -d node_modules ] || [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$LOCK" ]; then
      npm ci --no-audit --no-fund && echo "$LOCK" > node_modules/.lock-hash
    fi
    rm -rf .next && npm run build' >/dev/null
REMOTE

started=$(date +%s)
while :; do
  sleep 15
  state="$("${SSH[@]}" "docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' otelsayfam-build 2>/dev/null" || echo "ssh-hata")"
  case "$state" in
    running*|ssh-hata) printf '  … %ss\r' "$(( $(date +%s) - started ))" ;;
    "exited 0") echo; break ;;
    *)
      echo
      echo "Derleme başarısız ($state) — son satırlar:" >&2
      "${SSH[@]}" "docker logs --tail 40 otelsayfam-build 2>&1; docker rm otelsayfam-build >/dev/null" >&2 || true
      exit 1 ;;
  esac
done
"${SSH[@]}" "cd '$DIR' && docker logs otelsayfam-build > build.log 2>&1; docker rm otelsayfam-build >/dev/null; grep -m1 'Compiled successfully' build.log || true"

step "Ses servisi (Piper) imajı kuruluyor"
# İlk kurulumda ses modelini indirir (~60 MB); sonrakilerde Docker önbelleğinden gelir.
"${SSH[@]}" "cd '$DIR' && docker build -q -t otelsayfam-piper:latest piper >/dev/null"

step "Çalışma imajı kuruluyor ve uygulama yeniden başlatılıyor"
"${SSH[@]}" "cd '$DIR' && docker build -q -f Dockerfile.runtime -t otelsayfam-app:latest src >/dev/null && docker compose up -d 2>&1 | tail -3"

step "Ses servisi kontrol ediliyor"
"${SSH[@]}" "docker exec otelsayfam-app wget -qO /dev/null -T 10 --post-data='{\"text\":\"Merhaba.\"}' --header='Content-Type: application/json' http://piper:5000/synthesize" \
  && echo "  piper              hazır" \
  || echo "  piper              YANIT YOK — sesli yanıt tarayıcı sesine düşer (docker logs otelsayfam-piper)"

step "Sayfalar kontrol ediliyor"
fail=0
for path in / /kis /termal /termal/oteller /otel-bul; do
  code=000
  for _ in 1 2 3 4 5 6; do
    code="$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$APP_URL$path" || true)"
    [ "$code" = 200 ] && break
    sleep 3
  done
  printf '  %-18s %s\n' "$path" "$code"
  [ "$code" = 200 ] || fail=1
done
[ "$fail" = 0 ] || { echo "Hata: bazı sayfalar 200 dönmedi. Günlük: ssh $HOST docker logs --tail 50 otelsayfam-app" >&2; exit 1; }

printf '\n\033[1mTamam:\033[0m %s\n' "$APP_URL"
