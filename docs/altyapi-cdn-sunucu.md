# Dengizek — Altyapı, CDN & Sunucu Kararları

> **Güncelleme:** Nisan 2026  
> **Kapsam:** Nerede ne çalışır, nereye video gider, Docker kurulumu.

---

## Genel mimari — kim ne yapıyor

```
Kullanıcı tarayıcısı
      │
      ├─── Web / API ──────────────► DigitalOcean VPS (Docker)
      │                                    │
      │                               ┌────┴────────────────┐
      │                               │  docker-compose      │
      │                               │  ├─ app (Next.js)    │
      │                               │  ├─ postgres         │
      │                               │  ├─ redis            │
      │                               │  └─ nginx (reverse   │
      │                               │       proxy + SSL)   │
      │                               └─────────────────────┘
      │
      ├─── Görseller / dosyalar ───► Cloudflare R2 + Cloudflare CDN
      │
      └─── Video oynatma ──────────► Bunny Stream (CDN)
                                         ↑
                                   API upload emri verir
                                   Bunny transcode eder (ücretsiz)
                                   HLS olarak serve eder
```

**VPS video'ya dokunmaz.** API sadece Bunny'e upload emri verir, video ID'yi Postgres'e kaydeder. Kullanıcı videoyu doğrudan Bunny CDN'den çeker.

---

## Sunucu — DigitalOcean VPS + Docker ✅ (karar verildi)

### Droplet seçimi

| Senaryo | Boyut | RAM | vCPU | Disk | USD/ay |
|---|---|---|---|---|---|
| **Dev / MVP** | Basic | 4 GB | 2 | 80 GB SSD | **$24** |
| **Üretim (50 otel)** | Basic | 8 GB | 4 | 160 GB SSD | **$48** |
| **Büyüme (150+ otel)** | General Purpose | 16 GB | 4 | 200 GB SSD | **$96** |

Dev'de $24/ay ile başlanır. İlk gerçek otel canlıya alınınca $48'e geçilir.

### Docker Compose yapısı

```yaml
services:
  app:          # Next.js (build alınmış image)
  postgres:     # postgres:16-alpine — veri /volumes/postgres'te
  redis:        # redis:7-alpine — veri /volumes/redis'te
  nginx:        # reverse proxy, SSL termination (Let's Encrypt)
```

Her servis ayrı container, tek `docker-compose.yml` ile ayağa kalkar. Güncelleme: `docker compose pull && docker compose up -d`.

### SSL

Nginx + Certbot (Let's Encrypt) — ücretsiz, otomatik yenileme.

### Backup — kritik

Postgres kendi VPS'inizde olduğu için backup sorumluluğu sizde:

- **DigitalOcean Droplet Backups:** $24 Droplet için +$4.80/ay (her hafta snapshot, 4 kopya)
- **Ek önlem:** Günlük `pg_dump` → Cloudflare R2'ye upload (cron job, ~$0 ek maliyet)
- **Minimum:** Her ikisi birden — Droplet backup + R2'deki dump

> Backup kurulmadan üretim verisi koyulmaz.

---

## Veritabanı — Self-hosted Postgres (Docker) ✅ (karar verildi)

VPS içindeki Docker container'da çalışır. Ayrı ücret yok.

| Detay | Değer |
|---|---|
| Image | `postgres:16-alpine` |
| Veri | Docker volume (`/volumes/postgres`) |
| Erişim | Sadece iç network (dışarıya port açılmaz) |
| Backup | pg_dump → R2 (günlük cron) + Droplet snapshot |
| Bağlantı | `DATABASE_URL=postgres://user:pass@postgres:5432/dengizek` |

Neon / Supabase managed DB **kullanılmayacak.**

---

## Cache — Self-hosted Redis (Docker) ✅ (karar verildi)

VPS içindeki Docker container'da çalışır. Ayrı ücret yok.

| Detay | Değer |
|---|---|
| Image | `redis:7-alpine` |
| Veri | Docker volume (isteğe bağlı, cache için gerek yok) |
| Erişim | Sadece iç network |
| Kullanım | Oturum cache, rate limiting, job state |

Upstash **kullanılmayacak.**

---

## Video Pipeline — Bunny Stream ✅ (karar verildi)

VPS video'ya **dokunmaz.** Bunny Stream tam yönetimli pipeline sağlar.

| Detay | Değer |
|---|---|
| Encoding | **Ücretsiz** (otomatik HLS, çoklu çözünürlük) |
| Depolama | **$0.01/GB-ay** |
| Delivery (Avrupa/TR) | **$0.005/GB** |
| İstanbul PoP | ✅ Avrupa fiyatına dahil |
| Signed URL / token auth | ✅ Dahil |

### Upload → Oynatma akışı

```
1. Otel dashboard'dan raw video seçer
2. VPS'teki API → Bunny'den upload URL alır
3. Video doğrudan Bunny'e yüklenir (tarayıcıdan)
4. Bunny otomatik transcode eder (360p / 720p / 1080p HLS)
5. API, video ID'yi Postgres'e yazar (pipeline_status: processing → ready)
6. TourStep manifest bu ID'yi referans alır
7. Kullanıcı izlemeye başlayınca API signed token üretir
8. Tarayıcı HLS'i doğrudan Bunny CDN'den çeker
9. VPS bandwidth'i kullanmaz
```

### Neden Cloudflare Stream değil?

50 otel · 300 tur/ay senaryosunda Bunny Stream ~$5/ay, Cloudflare Stream ~$82/ay.

---

## Object Storage — Cloudflare R2

| Ne için | Görseller, PDF, küçük asset, pg_dump backup |
|---|---|
| Fiyat | $0.015/GB-ay |
| Egress | Ücretsiz |

Video buraya gitmez. Postgres dump'ları için de kullanılır (günlük cron ile).

---

## CDN — Cloudflare (statik) + Bunny (video)

**Cloudflare Free:** DNS, statik asset cache, temel WAF. VPS ve R2 önünde durur. Üretimde Pro ($20/ay) ile WAF kuralları genişletilebilir.

**Bunny CDN:** Video delivery. Bunny Stream seçilince otomatik gelir, ayrı kurulum gerektirmez.

---

## E-posta — Resend

| Dev | Ücretsiz (3.000 email/ay) |
|---|---|
| Üretim | PAYG |
| Ne için | Otel onboarding, inquiry bildirimi, magic link auth |

---

## Monitoring — Sentry

Free tier geliştirme için yeterli. Üretimde Team planına geçilir ($26/ay).

Ek olarak: `docker stats` + basit uptime check (UptimeRobot free tier).

---

## Aylık maliyet özeti

### Geliştirme / MVP ($24 Droplet)

| Kalem | Sağlayıcı | USD/ay |
|---|---|---|
| **VPS (app + DB + Redis)** | **DigitalOcean $24 Droplet** | **$24** |
| Droplet backup | DigitalOcean | ~$5 |
| Object storage | Cloudflare R2 | ~$3 |
| **Video pipeline** | **Bunny Stream** | **~$5** |
| CDN + DNS | Cloudflare Free | ~$1 |
| Email | Resend Free | $0 |
| Monitoring | Sentry Free | $0 |
| **TOPLAM** | | **~$38/ay** |

### Üretim (50 otel, $48 Droplet)

| Kalem | Sağlayıcı | USD/ay |
|---|---|---|
| **VPS (app + DB + Redis)** | **DigitalOcean $48 Droplet** | **$48** |
| Droplet backup | DigitalOcean | ~$10 |
| Object storage | Cloudflare R2 | ~$8 |
| **Video pipeline** | **Bunny Stream** | **~$5–15** |
| CDN + WAF | Cloudflare Pro | $20 |
| Email | Resend PAYG | ~$5 |
| Monitoring | Sentry Team | $26 |
| **TOPLAM** | | **~$122–132/ay** |

> Devir sonrası alıcı kendi hesaplarına geçer; bu maliyetler senden çıkar.

---

## Managed servislerden çıkış özeti

| Servis | Eskiden | Şimdi |
|---|---|---|
| Web hosting | Vercel | DigitalOcean VPS (Docker) |
| Veritabanı | Neon Postgres | Self-hosted Postgres (Docker) |
| Cache | Upstash Redis | Self-hosted Redis (Docker) |
| Video | Cloudflare Stream | **Bunny Stream** (değişmedi) |
| Object storage | Cloudflare R2 | Cloudflare R2 (değişmedi) |

---

## Açık kalan aksiyonlar

- [ ] DigitalOcean hesabı açılacak, $24 Droplet (Ubuntu 24.04) oluşturulacak
- [ ] Docker + Docker Compose kurulumu yapılacak
- [ ] `docker-compose.yml` yazılacak (app, postgres, redis, nginx)
- [ ] Let's Encrypt SSL kurulacak
- [ ] Günlük pg_dump → R2 cron job'u kurulacak
- [ ] Droplet Backup aktif edilecek
- [ ] Bunny Stream hesabı açılacak, test upload yapılacak
- [ ] Signed token akışı API'ye entegre edilecek
