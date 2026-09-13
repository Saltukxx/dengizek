# Dengizek — VPS deploy runbook

Genel mimari kararları için bkz. [`docs/altyapi-cdn-sunucu.md`](../docs/altyapi-cdn-sunucu.md).
Bu belge yalnızca somut komutları listeler.

## Ön koşullar (VPS'te bir kere)

- Docker + Docker Compose kurulu
- Repo VPS'e klonlanmış (`/opt/dengizek` varsayılır — farklıysa yollara göre uyarlayın)
- `deploy/backup.sh` kullanacaksanız `aws` CLI kurulu (R2 S3-uyumlu)

## 1. Ortam dosyası

```bash
cp apps/web/.env.example .env.production
```

`.env.production`'ı doldurun — **ek olarak** şunlar `docker-compose.prod.yml`
için gerekli (`.env.example`'da yok, `env.ts`'in production zorunlu listesine
ek):

```
POSTGRES_PASSWORD=<güçlü bir parola>
DATABASE_URL=postgresql://postgres:<yukarıdakiyle_aynı>@postgres:5432/dengizek
```

(`postgres` host adı — compose servis adı — kasıtlı, bkz. `.env.example` notu.)

## 2. Build + ilk kalkış

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## 3. Migrasyon (ilk deploy + her migration eklendiğinde)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:push
```

`pgvector` extension'ı image'da hazır gelir ama DB içinde etkinleştirilmesi
gerekir (kök `docker-compose.yml`'deki not aynen geçerli):

```bash
docker exec dengizek-pg-prod psql -U postgres -d dengizek -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

## 4. Doğrulama

```bash
curl -sI http://localhost/            # nginx üzerinden 200 dönmeli
docker compose -f docker-compose.prod.yml logs app --tail=50   # assertEnv hatası olmamalı
```

## 5. Cron kurulumu

`vercel.json`'daki 3 iş + günlük yedek için:

```bash
crontab -e   # deploy/crontab.example içeriğini yapıştırın, CRON_SECRET'i doldurun
```

## 6. Yedekleme

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh    # manuel test — crontab zaten günlük çalıştırır
```

## 7. SSL (domain hazır olduğunda)

1. DNS A kaydını VPS IP'sine yönlendirin.
2. `deploy/nginx/dengizek.conf`'ta `server_name _;` → gerçek domain.
3. Certbot webroot akışı için `docker-compose.prod.yml`'de yorumlu certbot
   volume satırlarını açın, bir certbot container'ı (veya host'ta certbot)
   ile sertifika alın, `dengizek.conf`'taki yorumlu 443 bloğunu aktive edin.
4. `NEXT_PUBLIC_APP_URL` ve `AUTH_SECRET`'i gerçek domaine göre güncelleyip
   `docker compose -f docker-compose.prod.yml up -d --build app` ile yeniden
   deploy edin (`NEXT_PUBLIC_*` build-time gömüldüğü için yeniden build şart).

## Güncelleme (yeni kod deploy etme)

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production build app
docker compose -f docker-compose.prod.yml --env-file .env.production up -d app
```

## Kapsam dışı

- Redis: mevcut kod kullanmıyor (JWT auth, Postgres tabanlı rate limiting) —
  eklenmedi.
- Bunny Stream / R2 / Resend / OpenAI hesapları: barındırmadan bağımsız, ayrı
  ayrı açılmalı — bkz. `apps/web/.env.example`.
