# Dengizek web (`apps/web`)

Next.js 15 (App Router) + TypeScript + Mantine 7. Tailwind yok. **Arayüz dili: Türkçe.**

## Komutlar

- `npm run dev` — geliştirme sunucusu (Turbopack)
- `npm run build` — üretim derlemesi
- `npm run test:ci` — Vitest birim testleri
- `npm run test:e2e` — Playwright duman testleri (dev sunucusunu başlatır)
- `npm run db:generate` / `db:push` — Drizzle şema migrasyonu
- `npm run db:seed` — demo veri + geliştirme kullanıcıları

## Ortam değişkenleri (`.env.local`)

Bkz. [.env.example](.env.example): `DATABASE_URL` (Neon), `AUTH_SECRET` (Auth.js),
`OPENAI_API_KEY` (AI rehber), `BUNNY_STREAM_*` (medya — boşsa mock mod).
Geliştirmede DB veya OpenAI yoksa mock veri kullanılabilir (`USE_MOCK_DATA=true`).
**Production'da** mock fallback kapalıdır — `DATABASE_URL` ve gerekli servisler zorunludur.

## Geliştirme kullanıcıları (seed)

**YALNIZCA GELİŞTİRME** — `npm run db:seed` ile oluşur:

| E-posta | Şifre | Rol |
|---|---|---|
| `admin@dengizek.dev` | `Admin123!` | Platform yöneticisi (`/admin`) |
| `yonetici@aurelia.dev` | `Yonetici123!` | Otel yöneticisi — aurelia-bay sahibi (`/dashboard`) |

## Rotalar

**Misafir** (yalnızca `yayinda` içerik görünür):
- `/` — tanıtım + öne çıkan oteller
- `/browse` — arama (`?q=`)
- `/hotels/[slug]` — otel detay + **Video tura başla**
- `/tours/[otel]/[tourId]` — **TourPlayer** (yayımlanmış manifest snapshot'ı)
- `/inquiry`, `/inquiry/success` — talep (DB'ye yazılır; DB yoksa mock)

**Otel yöneticisi** — `/dashboard/*` (giriş gerekli):
- Tesis bilgileri + AI profili, tur/adım editörü (dallar, callout, AI metadata),
  medya kütüphanesi (Bunny TUS yükleme), talep gelen kutusu, incelemeye gönderme.

**Platform yöneticisi** — `/admin/*` (admin rolü gerekli):
- Otel/tur moderasyonu (onay → yayın snapshot'ı + sürüm artışı; red → not zorunlu),
  kullanıcı yönetimi + otel üyelikleri, tüm talepler, denetim kaydı.

**Giriş:** `/giris` — Auth.js v5 (credentials + JWT). Middleware `/admin` ve
`/dashboard`'u korur; API guard'ları: `src/lib/auth/guards.ts`
(`requireAdmin`, `requireHotelAccess` — tenant izolasyonu).

## Yayın modeli

`tour_steps` her zaman taslaktır. Yönetici "İncelemeye gönder" der; admin
onaylayınca taslaktan **publishedManifest** snapshot'ı üretilir (`tours`
tablosu) ve sürüm artar. Misafir oynatıcı ile AI sohbeti yalnızca snapshot okur.

## Medya hattı (Bunny Stream)

`create-video` (sunucu, TUS imzası) → `tus-js-client` (tarayıcı → Bunny) →
`/api/webhooks/bunny?secret=...` (durum: yüklendi → işleniyor → hazır | hata).
`BUNNY_STREAM_*` env yoksa mock mod: kayıt oluşur, gerçek yükleme atlanır.

## Bu makineye özgü notlar

- **Norton antivirüs TLS araya girmesi:** Node, Neon/Google Fonts'a giden
  TLS'i doğrulayamayabilir (`fetch failed`). Çözüm: Norton kök sertifikasını
  PEM olarak dışa aktarıp `NODE_EXTRA_CA_CERTS=<pem yolu>` ile çalıştırın.
  `next build --turbopack` font indirmede yine başarısız olabilir —
  `npx next build` (webpack) sorunsuz derler.
- **Node 22.11:** `require(esm)` bayrağı vitest.config.mts içinde otomatik
  eklenir; Node ≥ 22.12'ye yükseltmek bu ihtiyacı kaldırır.

Mimari: [../../docs/adr/001-frontend-stack.md](../../docs/adr/001-frontend-stack.md)
