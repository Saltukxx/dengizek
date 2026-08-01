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

**Misafir** (yalnızca yayımlanmış snapshot'ı olan, askıya alınmamış içerik):
- `/` — tanıtım + öne çıkan oteller
- `/browse` — arama (`?q=`)
- `/hotels/[slug]` — otel detay + **Video tura başla**
- `/tours/[otel]/[tourId]` — **TourPlayer** (yayımlanmış manifest snapshot'ı)
- `/inquiry`, `/inquiry/success` — talep (DB'ye yazılır; DB yoksa mock)
- `/inquiry/portal/[token]` — misafir portalı: tesisle yazışma + **yorum bırakma**
  (yorum moderasyondan geçtikten sonra otel sayfasında "doğrulanmış" rozetiyle görünür)

**Otel yöneticisi** — `/dashboard/*` (giriş gerekli):
- Tesis bilgileri + AI profili, tur/adım editörü (dallar, callout, AI metadata),
  medya kütüphanesi (Bunny TUS yükleme), talep gelen kutusu, incelemeye gönderme.
- Odalar, dönemsel/plan fiyatları (kişi sayısı ve yaş bazlı çocuk fiyatı dahil),
  müsaitlik, rezervasyon, kampanya, yorum yanıtlama, finans.
- **Bağlantılar** — iCal: dışa aktarma bağlantısı + içe aktarma URL'si. İçe
  aktarma bir odaya bağlanır; `/api/internal/ical-sync` cron'u yarım saatte bir
  dış takvimdeki doluluğu envantere "satışa kapalı" olarak yazar. Elle
  düzenlenen günler (`manual_override`) ezilmez.

**Platform yöneticisi** — `/admin/*` (admin rolü gerekli):
- Otel/tur moderasyonu (onay → yayın snapshot'ı + sürüm artışı; red → not zorunlu).
  İnceleme kuyruğunda **"Gönderileni incele"** gönderilen snapshot'ı gösterir —
  public sayfa yayındaki sürümü okuduğu için onay kör yapılmaz.
- Yorum moderasyonu, kullanıcı yönetimi + otel üyelikleri, tüm talepler,
  rezervasyon/ödeme görünümü, denetim kaydı.

**Giriş:** `/giris` — Auth.js v5 (credentials + JWT). Middleware `/admin` ve
`/dashboard`'u korur; API guard'ları: `src/lib/auth/guards.ts`
(`requireAdmin`, `requireHotelAccess` — tenant izolasyonu).

## Yayın modeli

`tour_steps` ve tesis satırları her zaman **taslaktır**. Yönetici "İncelemeye
gönder" der; admin onaylayınca taslaktan snapshot üretilir
(`hotels.publishedSnapshot` / `tours.publishedManifest`) ve sürüm artar.
Misafir sayfaları, oynatıcı ve AI sohbeti **yalnızca snapshot okur**.

**Kesintisiz güncelleme:** Misafir görünürlüğü `status`'e değil, yayınlanmış
snapshot varlığına bağlıdır — tek kaynak
[src/lib/hotel-visibility.ts](src/lib/hotel-visibility.ts). Yayındaki bir tesis
doğrudan tekrar incelemeye gönderilebilir; inceleme boyunca marketplace'te
kalır ve misafir onaylanmış son sürümü görür. Yeni gönderim reddedilse bile
yayındaki sürüm düşmez.

Tesisi tamamen yayından kaldırmak moderasyonla değil **askıya alma** ile yapılır
(`/api/admin/hotels/[hotelId]/suspend` → `suspendedAt`).

## Medya hattı (Bunny Stream)

`create-video` (sunucu, TUS imzası) → `tus-js-client` (tarayıcı → Bunny) →
`/api/webhooks/bunny` — secret `x-webhook-secret` başlığıyla gönderilir (durum: yüklendi → işleniyor → hazır | hata).
`BUNNY_STREAM_*` env yoksa mock mod: kayıt oluşur, gerçek yükleme atlanır.

### İmzalı oynatma URL'leri

Misafire giden medya URL'leri **istek anında** imzalanır
([src/lib/bunny/sign.ts](src/lib/bunny/sign.ts)) — snapshot'ta imzasız kanonik
URL durur, çünkü `publishedManifest` kalıcı ama imza kısa ömürlüdür.

- Bunny **Advanced Token Authentication** + **dizin token'ı** (`token_path=/{guid}/`)
  — HLS'te playlist ve `.ts` segmentleri ayrı isteklerdir, dosya bazlı token yetmez.
- `BUNNY_CDN_TOKEN_KEY` **yoksa URL'ler imzasız sunulur** (kademeli açılış);
  production'da bu durum boot uyarısı verir.
- Oynatıcı `mediaTokenExpiresAt`'e bakıp süre dolmadan
  `/api/tour/playback-token` ile yeniler; adım kimliği değişmediği için
  oynatma pozisyonu korunur.

> ⚠️ İmzalama **gerçek Bunny hesabına karşı doğrulanmadı** (hesap yok). Birim
> testler implementasyonu kilitler; canlıda token auth açıldığında imzasız
> URL'in 403 döndüğü ve segmentlerin yetkilendiği teyit edilmelidir.

## Bu makineye özgü notlar

- **Norton antivirüs TLS araya girmesi:** Node, Neon/Google Fonts'a giden
  TLS'i doğrulayamayabilir (`fetch failed`). Çözüm: Norton kök sertifikasını
  PEM olarak dışa aktarıp `NODE_EXTRA_CA_CERTS=<pem yolu>` ile çalıştırın.
  `next build --turbopack` font indirmede yine başarısız olabilir —
  `npx next build` (webpack) sorunsuz derler.
- **Node 22.11:** `require(esm)` bayrağı vitest.config.mts içinde otomatik
  eklenir; Node ≥ 22.12'ye yükseltmek bu ihtiyacı kaldırır.

Mimari: [../../docs/adr/001-frontend-stack.md](../../docs/adr/001-frontend-stack.md)
