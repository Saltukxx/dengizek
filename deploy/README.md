# Otelsayfam — VPS deploy runbook

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

**0022–0025 için `db:push`'tan ÖNCE:** 0024 (talep moderasyonu) mevcut
talep ve mesajları "onaylandı" sayan bir `UPDATE` içerir; `db:push` bunu
çalıştırmaz. Sütunlar yalnız `db:push` ile eklenirse eski talepler "bekliyor"
durumuna düşer ve otel panellerinden kaybolur. Dosyalar tekrar çalıştırılabilir
(`IF NOT EXISTS`), bu yüzden önce SQL'leri uygulayın, sonra `db:push`:

```bash
for f in apps/web/drizzle/002{2,3,4,5}_*.sql; do
  sed 's/--> statement-breakpoint//' "$f" \
    | docker exec -i dengizek-pg-prod psql -U postgres -d dengizek -v ON_ERROR_STOP=1
done
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

## 4b. AI tur rehberi (Google Gemini)

AI rehberi Google Gemini API'sini kullanır; sunucuda ek servis gerekmez.
`.env.production`'a ekleyin:

```
GEMINI_API_KEY=<aistudio.google.com'dan alınan anahtar>
```

**Gerçek misafirlerden önce** Google projesinde faturalandırmayı açın:
ücretsiz katmanda içerik Google tarafından ürün geliştirmede kullanılır ve
istek sınırları düşüktür. Anahtar aynı kalır, kod değişmez. Fatura günlük
token tavanlarıyla sınırlıdır (bkz. `apps/web/.env.example`).

İlk kurulumda ve 0019 migration'ından sonra fact embedding'lerini üretin:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm app npm run db:backfill-embeddings
```

## 4c. Sesli yanıt (Piper)

Rehberin cevaplarını Türkçe okuyan `piper` servisi compose ile birlikte
kalkar (`deploy/piper/Dockerfile`, ses: `tr_TR-dfki-medium`). Ek ayar
gerekmez; uygulama `PIPER_URL=http://piper:5000` ile bağlanır. Servis
kapalıysa misafir yine sesli yanıt alır, ama tarayıcının kendi sesiyle.

- Kaynak: ~200 MB RAM; 8 saniyelik cevap ~0,3 sn'de üretilir. Compose'da
  512 MB / 1,5 çekirdek sınırı var.
- Kontrol: `docker exec dengizek-app wget -qO- http://piper:5000/info`
- Kapatmak için: `.env.production`'a `PIPER_URL=` (boş) yazın.
- Lisans: piper-tts GPL-3.0 — ayrı imaj/süreç olarak çalışır, uygulama
  koduna karışmaz. Devirde alıcıya belirtin.

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
- Bunny Stream / R2 / Resend / Google Gemini hesapları: barındırmadan bağımsız, ayrı
  ayrı açılmalı — bkz. `apps/web/.env.example`.


## Önizleme sunucusu (64.226.108.21:8080)

Başka projelerle paylaşılan bir sunucuda, onlardan bağımsız bir önizleme
kurulumu: `/opt/otelsayfam`, kendi Postgres'i (`otelsayfam-pg`), kendi
uygulaması (`otelsayfam-app`), önünde ters vekil (`otelsayfam-nginx`), yalnızca
**8080** portu. Sunucudaki diğer kapsayıcılara, portlara ve ayarlara dokunulmaz.

Dışarıya yalnız nginx bakar; uygulama host portu yayınlamaz. nginx `X-Real-IP`'yi
gerçek bağlanan adresle ezer, böylece istemci sahte `X-Forwarded-For` ile hız
sınırını aşamaz (bkz. `src/lib/rate-limit.ts`). TLS henüz yok (madde: HTTPS).

**Dağıtım (her güncellemede):**

```bash
deploy/preview/deploy.sh
```

Betik kodu `rsync` ile eşitler, sunucuda **1 CPU / 3.5 GB** sınırlı bir
kapsayıcıda derler (paylaşılan sunucu yavaşlamasın), çalışma imajını
(`deploy/preview/Dockerfile.runtime`) kurar, uygulamayı yeniden başlatır ve
sayfaları kontrol eder. Farklı sunucu için `DEPLOY_HOST`, `DEPLOY_DIR`,
`APP_URL` verilebilir.

**İlk kurulum (bir kere, elle):**

1. `/opt/otelsayfam/.env` → `POSTGRES_PASSWORD=<rastgele>`
2. `/opt/otelsayfam/.env.production` → `DATABASE_URL` (host `postgres`),
   `AUTH_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `AUTH_TRUST_HOST=true`,
   `AUTH_URL`, `GEMINI_API_KEY`; e-posta için `RESEND_API_KEY` + `EMAIL_FROM`.
   Gizli değerleri `openssl rand` ile üretin; dosyalar `chmod 600`.
3. Veritabanı: `docker compose up -d postgres`, `CREATE EXTENSION vector`,
   ardından `pg_restore` ile bir yedeği yükleyin (ya da `drizzle-kit push`).
   Seed çalıştırmayın: kurgusal demo oteller (Aurelia Bay, kış otelleri) yayımlar;
   betik yerel olmayan veritabanında zaten durur.
4. Fotoğraflar: `apps/web/public/uploads` → `/opt/otelsayfam/src/apps/web/public/uploads`
   (betik bu klasörü eşitlemez ve silmez).
5. `deploy/preview/deploy.sh`

Sesli yanıt: betik `deploy/piper`'ı da eşitleyip `otelsayfam-piper` imajını
kurar (ilk seferde ses modelini indirir) ve servisin yanıt verdiğini kontrol
eder. Servis 512 MB / 1 çekirdekle sınırlı, port açmaz.

Notlar: Docker'ın yayınladığı port ufw kurallarını atlar; 8080 ayrıca
açılmadan erişilebilir. Panelden yüklenen fotoğraflar çalışma imajının
içindedir; kapsayıcı yeniden kurulunca kaybolur (önizleme için kabul edildi).
