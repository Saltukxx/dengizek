---
title: Otelsayfam iOS Uygulaması - Plan
type: feat
date: 2026-11-09
artifact_readiness: draft
execution: code
---

# Otelsayfam iOS uygulaması — plan

**Tarih:** 9 Kasım 2026
**Durum:** Taslak. Aşağıdaki "Karar bekleyenler" netleşince uygulamaya hazır.
**Kapsam:** Yalnız iOS, Swift + SwiftUI. Android yok. Web sitesi ve API'ler aynı sistemde kalır; uygulama aynı veritabanını ve aynı AI rehberini kullanır.

## Amaç

Web sitesinin yaptığını cebe taşımak değil, telefonda daha iyi olanı yapmak:

- **Video tur** yerel oynatıcıyla (AVPlayer): akıcı, tam ekran, duraklar arası hızlı geçiş.
- **Sesli rehber** gerçek bir sesli görüşme gibi: mikrofon, cihaz içi konuşma tanıma, Piper sesi.
- **Bildirim:** Otel talebe cevap verince misafirin telefonuna push gelir. Web'de bu yok, uygulamanın en net farkı bu.
- **Kaydedilenler ve son bakılanlar** cihazda; internet zayıfken de açılır.

Apple'ın "web sitesini paketleyen uygulama" reddine (Guideline 4.2) karşı da bu farklar gerekli: uygulama WebView değil, yerel ekranlardan oluşur.

## Bugünkü sistemden çıkanlar

| Konu | Durum | Uygulama için anlamı |
|---|---|---|
| Sunucu adresi | `http://64.226.108.21:8080`, alan adı ve HTTPS yok | **Engel.** iOS şifresiz HTTP'yi engeller (ATS); Universal Links HTTPS alan adı ister. Önce alan adı + TLS. |
| Otel verisi | Sayfalar sunucuda render ediliyor (RSC); listeleme/detay için JSON API yok | Herkese açık, sürümlü bir okuma API'si (`/api/v1/...`) gerekir. Veri fonksiyonları (`hotels-repo.ts`, `guestCached`) hazır, API yalnız sarar. |
| Arama | `/api/search/hotels` JSON dönüyor | Doğrudan kullanılır, `v1` altına alınır. |
| Tur | `tour/playback-token` (Bunny imzalı HLS), manifest JSON (ADR 003) | AVPlayer HLS'i yerel oynatır. Tur durum makinesi (duraklar, açıklamalar, etkileşim beklemesi) Swift'te yeniden yazılır. |
| AI rehber | `tour/chat` AI SDK'nın akış biçimini (UI message stream) kullanıyor | Swift'te bu biçimi taklit etmek kırılgan; AI SDK sürümü değişince bozulur. Mobil için sade bir SSE uç noktası (aşağıda). |
| Ses | `voice/speak` → Piper WAV; mikrofon web'de tarayıcı konuşma tanıması | iOS'ta `SpeechAnalyzer` (iOS 26) / `SFSpeechRecognizer`; ses `AVAudioPlayer` ile, Piper yoksa `AVSpeechSynthesizer` (tr-TR). |
| Talep | `POST /api/inquiry`, takip `inquiry/portal/[token]` | Aynen kullanılır; portal bağlantısı uygulamada açılır (Universal Link). |
| Giriş | next-auth, e-posta + şifre, çerez tabanlı | Misafir için gerekmez (misafirin hesabı yok). Otelci modu için token tabanlı giriş eklenir (Aşama 3). |
| Bildirim | Panel içi bildirim tablosu var; push yok | APNs gönderici + cihaz token tablosu eklenir. |
| Ödeme | Stripe yazılı, `PAYMENTS_ENABLED` ile kapalı | Uygulamada yok. Açılırsa otel konaklaması fiziksel hizmet olduğu için Apple uygulama içi satın alma zorunlu değil. |

## Mimari kararlar (öneri)

| Konu | Öneri | Neden |
|---|---|---|
| Minimum iOS | **iOS 18** | Kullanıcıların büyük çoğunluğu; `@Observable`, `NavigationStack`, SwiftData olgun. iOS 26'ya özel API'ler (`SpeechAnalyzer`) `if #available` ile. |
| Arayüz | SwiftUI; UIKit yalnız gerekirse (ör. oynatıcı katmanı) | Tek kişilik ekip için en hızlı yol. |
| Durum | `@Observable` model + `async/await`; Swift 6 sıkı eşzamanlılık açık | Veri yarışlarını derleme anında yakalar. |
| Ağ | `URLSession` + `Codable`; istemci **OpenAPI'den üretilir** (`swift-openapi-generator`) | Sunucudaki zod şemalarından OpenAPI çıkarılır (`zod-to-openapi`); Swift tipleri elle yazılmaz, sunucu değişince derleme hatası verir. |
| Yerel veri | SwiftData: kaydedilenler, son bakılanlar, sohbet geçmişi (cihazda) | Hesapsız misafir için yeterli; iCloud eşitleme sonra. |
| Görsel önbellek | `URLCache` + küçük bir görsel yükleyici (bağımlılık yok) | |
| Harita | MapKit: otel konumu, bölge haritası, "yol tarifi" | |
| Bağımlılıklar | Yalnız Apple + `swift-openapi-generator`/`runtime`/`urlsession` | Bakım yükü düşük. |
| Repo | Aynı monorepo: `apps/ios/` (Xcode projesi) + yerel Swift paketleri | API değişikliği ile uygulama değişikliği aynı PR'da. |
| Dil | Türkçe, String Catalog; İngilizce Aşama 2 | |

### Modüller (yerel Swift paketleri)

- `OtelsayfamAPI` — üretilmiş istemci, kimlik/cihaz başlıkları, hata eşleme.
- `DesignSystem` — renk, yazı, boşluk token'ları (ADR 002'den); yaz / kış / termal temaları.
- `TourPlayer` — AVPlayer sarmalayıcı, manifest modeli, durak/açıklama/düğme durum makinesi.
- `Guide` — rehber sohbeti, kart görünümleri, ses girişi/çıkışı.
- `Features/*` — Keşfet, Arama, Otel, Talep, Kaydedilenler, (Aşama 3) Otelci.

## Sunucu tarafı hazırlık (web reposunda)

Uygulama yazılmadan önce ya da onunla paralel:

1. **Alan adı + HTTPS.** Nginx'e TLS (Let's Encrypt), `NEXT_PUBLIC_APP_URL` güncellenir. Uygulamanın tüm istekleri bu adrese.
2. **`/api/v1/public` okuma API'si:**
   - `GET /v1/hotels?season=termal|yaz|kis&city=&cursor=` — liste kartları.
   - `GET /v1/hotels/{slug}` — yayın snapshot'ı (açıklama, olanaklar, galeri, odalar, kurallar, iletişim kuralları).
   - `GET /v1/hotels/{slug}/rooms`, `/availability-summary`, `/cancellation-summary` (mevcutlar taşınır).
   - `GET /v1/hotels/{slug}/tours/{tourId}` — yayındaki manifest.
   - `GET /v1/search?q=` — doğal dil arama.
   - `GET /v1/showcase/{season}` — vitrin metinleri, sayılar, demo sohbet.
   - `GET /v1/app-config` — en düşük desteklenen uygulama sürümü, özellik bayrakları.
   - Hepsi mevcut `guestCached` önbelleğinden okur; askıdaki ve yayında olmayan oteller web'deki gibi gizli.
3. **Mobil rehber akışı `POST /v1/guide/chat`:** Aynı `chat-handler` mantığı; çıkışı sade SSE olaylarına çevirir: `text` (parça), `card` (doğrulanmış bilgi kartı), `navigate` (tur durağı), `inquiry` (talep öner), `done` (soru kaydı kimliği), `error`. Web akışı değişmez.
4. **Cihaz kimliği ve sınırlar:** Web'deki ziyaret çerezinin yerine `X-Device-Id` başlığı (uygulama ilk açılışta üretir, Keychain'de tutar). Hız sınırları IP + cihaz başına.
5. **Push:** `device_tokens` tablosu (token, ortam, dil, bağlı talep portal token'ları). APNs token tabanlı kimlik (.p8) ile HTTP/2 gönderici; mevcut e-posta kuyruğunun (`email-outbox`) yanına bir bildirim kuyruğu. Tetikleyici: talebe otel/admin cevabı onaylandığında.
6. **Universal Links:** `/.well-known/apple-app-site-association` — `/hotels/*`, `/termal/oteller/*`, `/kis/oteller/*`, `/tours/*`, `/inquiry/portal/*`.
7. **OpenAPI:** `v1` şemaları zod'dan; `openapi.json` derlemede üretilir, CI'da Swift istemcisi bundan derlenir. Sözleşme testleri: `v1` yanıtları şemaya uyuyor mu.
8. **Gemini faturalandırması açık olmalı.** Ücretsiz katmanda misafir mesajları Google'ın ürün geliştirmesinde kullanılıyor; App Store gizlilik beyanı ve KVKK metni bununla çelişir.

## Aşamalar

Süreler tek geliştirici için kaba tahmindir.

### Aşama 0 — Altyapı (≈2 hafta)
- Sunucu: 1, 2, 4, 7 (alan adı, okuma API'si, cihaz kimliği, OpenAPI).
- iOS: Xcode projesi, paketler, `DesignSystem`, API istemcisi, CI (Xcode Cloud ya da GitHub Actions macOS), TestFlight'a ilk boş derleme.
- **Çıktı:** TestFlight'ta otel listesini API'den çeken uygulama.

### Aşama 1 — Misafir MVP (≈5–6 hafta)
- **Keşfet:** Termal / yaz / kış vitrinleri, bölge kısayolları, öne çıkan oteller.
- **Arama:** Doğal dil arama kutusu, filtreler, sonuç listesi + harita.
- **Otel sayfası:** Galeri, açıklama, olanaklar, odalar, fiyat ("X tarihinden itibaren" dahil), iptal özeti, konum.
- **Video tur:** HLS oynatma, durak şeridi, açıklamalar, etkileşim düğmeleri, "Oteli gezdir" otomatik tur, altyazı.
- **AI rehber (yazılı):** Otel sayfasında ve tur sırasında; doğrulanmış bilgi kartı, "bilgim yok → otele soralım" akışı, 👍/👎.
- **Talep:** Form, gönderim, talep takibi (portal ekranı yerel).
- **Kaydedilenler / son bakılanlar** (SwiftData).
- **Gizlilik:** KVKK aydınlatma, analitik izni (web'deki onay mantığı), gizlilik manifesti.
- **Çıktı:** Dış test (TestFlight) için hazır misafir uygulaması.

### Aşama 2 — Uygulamaya özgü güç (≈3 hafta)
- **Sesli rehber:** Bas-konuş ve sesli görüşme modu; Türkçe cihaz içi tanıma (desteklenmiyorsa sunucu tanıma seçeneği karar bekler); Piper sesi, olmazsa sistem sesi.
- **Push bildirimleri:** Talep cevabı, talep durumu. İzin, ilk talep gönderiminden sonra istenir (açılışta değil).
- **Universal Links:** Paylaşılan otel, tur ve portal bağlantıları uygulamada açılır.
- **Paylaşım:** Otel/tur paylaşma (`ShareLink`), paylaşım önizlemesi web'deki Open Graph ile aynı.
- **İngilizce.**
- **Çıktı:** App Store'a gönderim.

### Aşama 3 — Otelci modu (≈4 hafta, isteğe bağlı)
Aynı uygulamada "Otelci girişi" ya da ayrı uygulama (karar bekliyor).
- Token tabanlı giriş: `POST /v1/auth/token` (kısa ömürlü erişim + yenileme token'ı, Keychain), mevcut giriş sınırı ve güvenli IP kuralları geçerli.
- Gelen talepler ve mesajlar, cevap yazma (admin onayı akışı korunur).
- Yeni talep push bildirimi.
- Hızlı kontenjan/müsaitlik ve fiyat kapatma.
- Cevapsız rehber soruları → "Cevap ekle" (web panelindeki akış).
- Hesap silme talebi (App Store 5.1.1(v)).

## App Store hazırlığı

- **Apple Developer Program:** Şirket hesabı önerilir (uygulama satıcısı olarak şirket adı görünür; D-U-N-S numarası gerekir, birkaç gün sürebilir). Yıllık ücret.
- **4.2 Minimum işlev:** Yerel oynatıcı, sesli rehber, push, kaydedilenler; WebView ekranı yok.
- **Gizlilik etiketleri:** Rehber sohbet metni ve ses metni sunucuya (ve Gemini'ye) gider → "Kullanıcı içeriği" beyanı. Analitik yalnız izinle; uygulamalar arası takip yok → ATT gerekmez.
- **Gizlilik manifesti (`PrivacyInfo.xcprivacy`):** `UserDefaults` vb. gerekçeli API'ler.
- **AI içerik:** Rehber cevaplarının otel bilgisinden geldiği ve hata yapabileceği uygulama içinde belirtilir.
- **İnceleme notu:** İnceleme ekibi için yayındaki bir otel ve tur; otelci modu varsa demo hesap (canlı veriye yazmayan).

## Test

- **Birim:** Swift Testing — manifest çözme, tur durum makinesi, SSE ayrıştırıcı, fiyat gösterimi, hata eşleme.
- **Sözleşme:** Sunucuda `v1` yanıtları OpenAPI'ye uygun mu (vitest); iOS'ta üretilmiş istemci derleniyor mu (CI).
- **Arayüz:** XCUITest — keşfet → otel → tur → rehber sorusu → talep; erişilebilirlik (VoiceOver etiketleri, Dynamic Type).
- **Gerçek cihaz:** Ses ve push yalnız gerçek cihazda; TestFlight iç test grubu.
- **AI doğruluğu:** Sunucudaki mevcut eval'lar aynen geçerli (aynı handler). Mobil SSE çevirisi için ayrı birim testi.

## Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Alan adı/HTTPS gecikir | Uygulama gerçek sunucuya bağlanamaz | Aşama 0'ın ilk işi; geçici olarak yalnız geliştirmede ATS istisnası. |
| Gerçek misafir trafiği yok | Uygulama indirilmez | Uygulama tek başına kanal değil; web'den "uygulamada aç" bağlantısı, talep sonrası "cevabı bildirimle al" çağrısı. |
| Termal otellerde gerçek tur videosu yok | Uygulamanın ana özelliği boş kalır | Yayın öncesi en az birkaç otelde tur çekimi. |
| Türkçe cihaz içi konuşma tanıma desteği | Sesli rehber zayıf | Aşama 2 başında cihazda doğrula; olmazsa sunucu tanıma (gizlilik metni güncellenir). |
| Rehber gecikmesi (~7 sn) | Sesli görüşme hissi bozulur | Faturalı katmanda gecikme ölçümü; ilk cümle gelince seslendirmeye başla. |
| AI maliyeti | Uygulama kullanımıyla artar | Cihaz başı sınır, sunucu planlayıcısı zaten turların çoğunu modelsiz cevaplıyor. |
| AI SDK akış biçimi değişir | Mobil rehber bozulur | Mobil için ayrı sade SSE uç noktası (yukarıda 3). |

## Karar bekleyenler

1. **Alan adı:** Ne olacak (ör. otelsayfam.com)? Aşama 0 buna bağlı.
2. **Otelci modu:** Aynı uygulamada mı, ayrı uygulama mı, yoksa şimdilik hiç mi?
3. **Developer hesabı:** Şirket (gbsoft) mi, bireysel mi? Uygulama adı ve paket kimliği (ör. `com.gbsoft.otelsayfam`).
4. **Minimum iOS 18** uygun mu?
5. **Ses tanıma** cihazda olmazsa sunucuya ses göndermek kabul edilir mi?
