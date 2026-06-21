# AI Destekli Tur Motoru — Detaylı Plan

**Proje:** Dengizek  
**Tarih:** Nisan 2026  
**Durum:** Faz 1–6 uygulandı — completion engine, response guard, AI analytics, ai-metrics panel, fact cache, context router, readiness score, production manifest hardening

### Uygulanan Değişiklikler (Haziran 2026 — AI motor KPI)

| Dosya | Durum | Açıklama |
|-------|-------|----------|
| `src/lib/ai/completion-engine.ts` | ✅ | Deterministik `computeCompletionState`, openInquiry %80 gate |
| `src/lib/ai/response-guard.ts` | ✅ | Serbest metin fiyat blok + tool keyword hints |
| `src/lib/ai/context-router.ts` | ✅ | Prompt fact alt kümesi (~15 entry) |
| `src/lib/ai/readiness-score.ts` | ✅ | Panel veri kalitesi skoru 0–100 |
| `src/lib/ai/fact-store.ts` | ✅ | TTL cache + otel ifadesi etiketi |
| `src/app/api/tour/chat/route.ts` | ✅ | completionMeta, guard stream, tool execute |
| `src/lib/tour/use-tour-guide.ts` | ✅ | openInquiry client gate, analytics, completionMeta |
| `src/components/tour-player/TourPlayer.tsx` | ✅ | tour_step_view / tour_complete analytics |
| `src/lib/schemas/analytics.ts` | ✅ | AI-only event allowlist |
| `src/app/api/manager/.../ai-metrics/route.ts` | ✅ | 30 günlük AI tur metrikleri + readiness |
| `src/components/dashboard/ai-tour-metrics.tsx` | ✅ | Panel kartı (property sayfası) |
| `src/lib/mocks/hotels.ts` | ✅ | Production'da manifest mock kapalı |

### Uygulanan Değişiklikler (28 Nisan 2026)

| Dosya | Durum | Açıklama |
|-------|-------|----------|
| `src/lib/schemas/tour-manifest.ts` | ✅ Tamamlandı | `aiTags`, `aiDescription`, `aiPromo`, `aiVisible`, `hotelProfileSchema` eklendi |
| `src/lib/mocks/demo-tour.json` | ✅ Tamamlandı | v3'e yükseltildi, AI metadata ve `hotelProfile` eklendi |
| `src/app/api/tour/chat/route.ts` | ✅ Tamamlandı | GPT-4o-mini + native fetch, 5 tool — artık sadece sunucu-taraflı bağlam (Faz 3'te güçlendirildi) |
| `src/lib/tour/use-tour-guide.ts` | ✅ Tamamlandı | Proaktif tetikleyiciler, idle timer, autoTour state, nudge limiti |
| `src/components/tour-player/TourGuidePanel.tsx` | ✅ Tamamlandı | Scrollable chat, chips, TextInput |
| `src/components/tour-player/tour-guide-message.tsx` | ✅ Tamamlandı | AI/user balonları + thinking animasyonu |
| `src/components/tour-player/tour-guide-chips.tsx` | ✅ Tamamlandı | Öneri chip satırı |
| `src/components/tour-player/auto-tour-button.tsx` | ✅ Tamamlandı | "Oteli Gezdirr" / "Turu Durdur" toggle |
| `src/components/tour-player/TourPlayer.tsx` | ✅ Tamamlandı | 70/30 layout, `useTourGuide` entegrasyonu, `stepsSeen` tracking |

### Teknik Notlar

- **OpenAI SDK kullanılmadı** — native `fetch` ile OpenAI REST API çağrısı (node_modules mount sorunu nedeniyle)
- **Seçilen model:** `gpt-4o-mini` — en düşük maliyet/kalite dengesi (~$2-3/ay 10K sohbette)
- **OPENAI_API_KEY** yoksa development mock yanıt döner, production 503 döner
- **Encoding sorunu:** Write tool'u bazen Windows mount üzerinde UTF-8 dosyaları keser; kritik dosyalar Python ile yazıldı

---

## 1. Vizyon

Kullanıcı, otel turunu önceden belirlenmiş bir sıra yerine **yapay zeka ile sohbet ederek** kendi hızında ve kendi ilgi alanına göre keşfeder. "Sahili görmek istiyorum" der, sahil videosu açılır. "Su sporları var mı?" diye sorar, cevabı alır. "Bana oteli gezdirr" dediğinde AI otomatik olarak tüm alanları sırayla anlatarak gezdirir.

Her otel, kendi sayfasına fotoğraflarını ve bilgilerini yükler. AI motoru bu veriyi sunucu tarafında okur — istemci hiçbir zaman AI bağlamını iletmez veya değiştiremez.

Mevcut `branches[]` sistemi (sabit dallanma butonları) bu sistemin üzerine inşa edilir, yerini almaz — AI onun üstünde bir navigasyon katmanı olarak çalışır.

---

## 2. Kararlaştırılan Tasarım Seçimleri

| Konu | Karar |
|------|-------|
| AI navigasyon yöntemi | OpenAI tool calling (`navigateTo`, `openInquiry`, `autoTourNext`) |
| Chat konumu | Sabit side panel, 70/30 split (masaüstü) · Drawer (mobil) |
| AI persona adı | **Yapay Zeka Rehberi** |
| Ses girişi | MVP'de yok |
| Otomatik tur modu | Evet — "Oteli Gezdirr" butonu ile başlar |
| AI proaktifliği | Evet — stepStart, stepEnd, idle, conversion push |
| Hallucination koruması | AI sadece sunucu tarafındaki otel verisini kullanır; istemci bağlam göndermez |
| Latency stratejisi | API yanıtı gelirken video durmaz, "düşünüyor..." gösterilir |
| Otel veri kaynağı | Sunucu tarafı — DB / manifest dosyası; istemci hiçbir AI verisi gönderemez |

---

## 3. Mimari Genel Bakış

### 3.1 Mevcut Mimari (Faz 1-2)

```
Kullanıcı mesajı / tetikleyici
        ↓
POST /api/tour/chat
  └─ client gönderir: hotelSlug, tourId, currentStepId, stepsSeen, triggerReason, history
  └─ sunucu çeker: getDemoTourManifest(hotelSlug, tourId) → manifest (adımlar + hotelProfile)
  └─ sunucu inşa eder: sistem prompt (sadece manifest + hotelProfile verisiyle)
        ↓
OpenAI API (tool calling)
  └─ navigateTo(stepId)       → video adımını değiştir
  └─ answerQuestion(text)     → sadece metin yanıt
  └─ suggestNext(stepIds[])   → chip öner
  └─ openInquiry(roomSlug?)   → rezervasyon formunu aç
  └─ autoTourNext(stepId)     → otomatik tur geçişi
        ↓
Client: action işle + chat'e mesaj yaz
```

### 3.2 Hedef Mimari (Faz 3+ sonrası)

```
Otel Sahibi (Dashboard)
  └─ Fotoğraf / video yükle → blob storage (S3 / Vercel Blob)
  └─ AI metadata doldur (aiPersona, facts, policies, her adım için aiTags/aiDescription/aiPromo)
  └─ Kaydet → PostgreSQL (hotels + tour_steps tabloları)
        ↓
GET /otel/[slug]/tur  →  TourPlayer
  └─ Server component: DB'den manifest çeker, istemciye step listesi (sadece görünür alanlar) verir
        ↓
POST /api/tour/chat
  └─ client gönderir: hotelSlug, tourId, currentStepId, stepsSeen, triggerReason, history
  └─ server çeker: DB.query("SELECT ... FROM tour_steps WHERE hotel_slug = ?", hotelSlug)
  └─ istemciden gelen availableSteps / hotelProfile KABUL EDİLMEZ
  └─ sistem prompt tamamen sunucu tarafında inşa edilir
        ↓
OpenAI API → action → client
```

### 3.3 Güvenlik Sınırı

| İstemciden gelen | Sunucu tarafından gelen |
|---|---|
| `hotelSlug` (sadece tanımlayıcı) | Otel adı, persona, dil |
| `tourId` | Tüm adım bilgileri (aiTags, aiDescription, aiPromo) |
| `currentStepId` (sadece ID) | facts, policies |
| `stepsSeen[]` (sadece ID listesi) | aiVisible filtrelemesi |
| `triggerReason` | — |
| `userMessage` | — |
| `history` (son 6 mesaj) | — |

İstemci hiçbir zaman `availableSteps`, `hotelProfile` veya AI prompt bağlamını iletmez. Bu, otel verilerinin manipüle edilmesini önler.

---

## 4. Otel Veri Modeli

### 4.1 Veritabanı Şeması (Hedef)

```sql
-- Otel ana profili
CREATE TABLE hotels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  city            TEXT,
  country         TEXT,
  description     TEXT,
  price_label     TEXT,

  -- AI profil alanları
  ai_persona      TEXT DEFAULT 'Yapay Zeka Rehberi',
  ai_language     TEXT DEFAULT 'tr',
  ai_facts        TEXT[] DEFAULT '{}',    -- ["5 yıldız", "200 oda", "1923 kuruluş"]
  ai_policies     TEXT[] DEFAULT '{}',   -- ["Check-in 14:00", "Ücretsiz iptal 48s"]

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tur adımları (fotoğraf / video + AI metadata)
CREATE TABLE tour_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_slug      TEXT NOT NULL REFERENCES hotels(slug),
  tour_id         TEXT NOT NULL,
  step_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  kind            TEXT NOT NULL,         -- "room" | "amenity_spot" | "exterior" ...
  order_index     INT NOT NULL,

  -- Medya
  media_url       TEXT,                  -- video URL (blob storage)
  thumbnail_url   TEXT,                  -- poster/thumbnail

  -- AI metadata
  ai_tags         TEXT[] DEFAULT '{}',   -- ["sahil", "plaj", "deniz", "beach"]
  ai_description  TEXT,                  -- "Otelin 200m özel kumsalı..."
  ai_promo        TEXT[] DEFAULT '{}',   -- ["Şezlong ücretsiz", "Günbatımı kokteyl servisi"]
  ai_visible      BOOLEAN DEFAULT TRUE,  -- false → otomatik turda atlanır

  -- Mevcut manifest alanları (geriye uyum)
  branches        JSONB DEFAULT '[]',
  callouts        JSONB DEFAULT '[]',
  step_key        TEXT,

  UNIQUE(hotel_slug, tour_id, step_id)
);
```

### 4.2 Geçiş Stratejisi (Mock → DB)

Şu anda `src/lib/mocks/hotels.ts` içindeki `getDemoTourManifest()` doğrudan JSON dosyasını döner. Hedef mimariyle uyumlu geçiş:

```
Faz 3: Mock devam eder, API route zaten sunucu-taraflı çekiyor ✅
Faz 4: getDemoTourManifest() → getManifestFromDB(hotelSlug, tourId) ile değiştirilir
Faz 5: Hotel dashboard'u aracılığıyla otel sahipleri kendi verilerini yönetir
```

API route imzası değişmez; sadece iç implementasyon mock'tan DB'ye geçer.

---

## 5. Manifest Şeması Değişiklikleri

### 5.1 TourStep'e Eklenenler

```typescript
// src/lib/schemas/tour-manifest.ts

aiTags: z.array(z.string()).optional()
// Örnek: ["sahil", "plaj", "deniz", "beach", "kumsal"]
// Çok dilli, sinonim destekli — AI intent matching için kullanır

aiDescription: z.string().optional()
// Örnek: "Otelin 200m özel kumsalı, şezlong ve bar hizmetleri"
// AI'ın context'ine gönderilir, kullanıcıya anlatması için

aiPromo: z.array(z.string()).optional()
// Örnek: ["Şezlong ücretsiz", "Günbatımında kokteyl servisi"]
// Satış odaklı konuşma noktaları

aiVisible: z.boolean().optional()
// false ise AI bu adımı önermez / otomatik turda atlar
// default: true
```

### 5.2 Otel Seviyesinde `hotelProfile` (Manifest kökü)

```typescript
hotelProfile: z.object({
  aiPersona: z.string(),           // "Yapay Zeka Rehberi"
  language: z.string(),            // "tr" — varsayılan sohbet dili
  facts: z.array(z.string()),      // ["5 yıldız", "200 oda", "1923 kuruluş"]
  policies: z.array(z.string()),   // ["Check-in 14:00", "Ücretsiz iptal 48s"]
}).optional()
```

---

## 6. API: `POST /api/tour/chat`

### Request (istemciden gelen — minimal, güvenli)

```typescript
{
  hotelSlug: string              // sadece tanımlayıcı; sunucu bununla DB'yi çeker
  tourId: string
  currentStepId: string
  stepsSeen: string[]            // görülen adım ID'leri
  triggerReason:
    | "tourStart"                // tur ilk açıldığında
    | "stepStart"                // yeni adım açıldığında
    | "stepEnd"                  // video bittiğinde
    | "idle"                     // 12s hareketsizlik
    | "userMessage"              // kullanıcı yazdı
    | "autoTourNext"             // otomatik tur geçişi
  userMessage?: string           // triggerReason="userMessage" ise dolu
  isAutoTour: boolean
  history: { role: "user" | "assistant", content: string }[]  // son 6 mesaj

  // ❌ availableSteps ve hotelProfile artık istemciden KABUL EDİLMEZ
  // Sunucu bunları hotelSlug + tourId ile bağımsız olarak çeker
}
```

### Response

```typescript
{
  message: string                // chat paneline yazılacak metin
  action?:
    | { type: "navigate";      stepId: string }
    | { type: "openInquiry";   roomSlug?: string }
    | { type: "autoTourNext";  stepId: string; delayMs: number }
    | { type: "endAutoTour" }
  chips?: string[]               // max 3 öneri chip
}
```

### System Prompt Yapısı

```
[Kimlik]
Sen {aiPersona}'sın — {hotelName} otelinin sanal tur asistanısın.
Sıcak, bilgili, kısa konuş (maks 2 cümle + chip öner).
Satışa yönlendir ama sert baskı yapma.

[Kısıtlamalar]
- Sadece aşağıdaki verilerden konuş. Bilmiyorsan "Bu konuda otelden 
  sizin için bilgi alabilirim" de, uydurma.
- Rakip otelden bahsetme.

[Otel Profili]
facts: {facts}
policies: {policies}

[Mevcut Bağlam]
currentStep: {stepId} — {aiDescription}
stepsSeen: {stepsSeen}
stepsAvailable: {aiVisible adımları — id, aiTags, aiDescription}
triggerReason: {triggerReason}
isAutoTour: {isAutoTour}

[Araçlar]
navigateTo(stepId) — kullanıcıyı o adıma götür
answerQuestion(text) — video geçişi olmadan bilgi ver
suggestNext(stepIds[]) — chip olarak öner
openInquiry(roomSlug?) — rezervasyon formunu aç
autoTourNext(stepId, delayMs) — otomatik turda sıradaki adıma geç
```

---

## 7. Proaktif Tetikleyiciler

| Tetikleyici | Ne Zaman | AI Davranışı |
|---|---|---|
| `tourStart` | Kullanıcı turu açtığında | Karşılama + nereden başlamak istediğini sor |
| `stepStart` | Her adım açılışında | O alanı tanıt, ilgi çekici bir detay ver |
| `stepEnd` | Video bittiğinde | "Hoşunuza gitti mi?" + henüz görmediği bir alanı öner |
| `idle` (12s) | 12 saniye hareketsizlik | Merak uyandıran hafif bir soru |
| conversion (3+ adım) | 3 veya daha fazla adım görüldüğünde | Bilgi alma / rezervasyon talebi öner |

**Nudge Kuralları:**
- Turda toplam maks **3 proaktif mesaj** (kullanıcı sorarsa sınır yok)
- Aynı chip **2 kez reddedilirse** o konu için sessiz kal
- `nudgeCount` client'ta tutulur, maks 3'te susturulur

---

## 8. Otomatik Tur Modu

### Akış

```
Kullanıcı "Oteli Gezdirr" butonuna basar
        ↓
isAutoTour = true
triggerReason = "tourStart"
        ↓
API → message (karşılama narasyonu) + action: autoTourNext(s1, 2000ms)
        ↓
2 saniye sonra s1 başlar
        ↓
video biter → triggerReason = "stepEnd", isAutoTour = true
        ↓
API → message (geçiş narasyonu) + action: autoTourNext(s2, 1500ms)
        ↓
... tüm aiVisible adımlar tamamlanana kadar devam eder
        ↓
Son adımdan sonra: action: endAutoTour + conversion push
```

### Interrupt Desteği

Otomatik tur sırasında kullanıcı yazarsa veya chip'e tıklarsa:
1. `isAutoTour` false olur, pending `autoTourNext` timer iptal edilir
2. Kullanıcı isteği normal `userMessage` olarak işlenir
3. İşlem sonunda AI "Otomatik tura devam edeyim mi?" diye sorar

---

## 9. Otel Dashboard (Hotel CMS)

Her otel sahibi kendi içeriklerini yönetebileceği bir dashboard'a sahip olur. Bu sayfa `/dashboard/[slug]` altında yaşar ve kimlik doğrulama gerektirir.

### 9.1 Dashboard Sayfaları

```
/dashboard/[slug]
  ├── /profil           ← Otel genel bilgileri + AI persona ayarları
  ├── /tur/[tourId]     ← Tur adımları listesi
  └── /tur/[tourId]/adim/[stepId]  ← Tek adım düzenle (medya + AI metadata)
```

### 9.2 Otel Profil Sayfası (`/dashboard/[slug]/profil`)

Otel sahibinin doldurabileceği alanlar:

- **Otel adı, şehir, ülke** (genel bilgi)
- **AI Persona Adı** — varsayılan "Yapay Zeka Rehberi", özelleştirilebilir (ör. "Deniz")
- **AI Dili** — Türkçe / İngilizce / Otomatik (kullanıcı diline göre)
- **Otel Gerçekleri (facts)** — metin listesi; her satır bir bilgi ("5 yıldız", "Özel kumsal")
- **Politikalar (policies)** — check-in/check-out, iptal koşulları, evcil hayvan politikası vb.

### 9.3 Tur Adım Düzenleme (`/dashboard/.../adim/[stepId]`)

Her adım için:

- **Video / Fotoğraf yükle** → Vercel Blob / S3'e yüklenir, URL kaydedilir
- **AI Etiketleri (aiTags)** — virgülle ayrılmış anahtar kelimeler; kullanıcı "sahil" dediğinde bu adım eşleşir
- **AI Açıklaması (aiDescription)** — AI'ın bu alanı anlatmak için kullanacağı 1-2 cümlelik açıklama
- **Satış Noktaları (aiPromo)** — "Şezlong ücretsiz", "Günbatımı kokteyl servisi" gibi öne çıkarılacak avantajlar
- **Otomatik Turda Göster (aiVisible)** — toggle; kapalıysa bu adım otomatik turda atlanır

### 9.4 Medya Yükleme Akışı

```
Otel sahibi dosya seçer
        ↓
PUT /api/upload → Vercel Blob / S3'e yükle
        ↓
Dönen URL → tour_steps.media_url güncelle
        ↓
TourPlayer bu URL'yi kullanarak video/resim yükler
```

---

## 10. State Machine Değişiklikleri

`use-tour-player-machine.ts`'e eklenecek state'ler:

```typescript
// Mevcut state'ler (değişmez):
// idle | playing | paused | awaitingContinue | awaitingBranch

// Yeni AI state'leri (paralel çalışır — video durmaz):
| "aiThinking"         // API çağrısı sürüyor → spinner
| "aiSpeaking"         // Mesaj gösteriliyor → bubble animasyonu
| "awaitingUserChoice" // Chip seçimi bekleniyor
| "navigating"         // navigateTo() çağrıldı → fade geçişi
```

**Önemli:** AI state'leri video playback state'i ile bağımsız çalışır. `aiThinking` sırasında video oynamaya devam eder.

---

## 11. UI Bileşenleri

### Layout (TourPlayer.tsx)

```
┌─────────────────────────────┬──────────────────┐
│                             │  Yapay Zeka       │
│                             │  Rehberi          │
│    Video Player (70%)       │  ─────────────    │
│                             │  [chat geçmişi]   │
│    [Oteli Gezdirr butonu]   │  [chips]          │
│                             │  [input]          │
└─────────────────────────────┴──────────────────┘
Mobil: video tam genişlik + altta drawer
```

### Bileşenler

| Dosya | Açıklama |
|-------|----------|
| `TourGuidePanel.tsx` | Ana panel wrapper — header + chat + chips + input |
| `tour-guide-message.tsx` | Tek bir chat balonu (AI veya kullanıcı) |
| `tour-guide-chips.tsx` | Öneri chip'leri satırı |
| `auto-tour-button.tsx` | "Oteli Gezdirr" / "Durdur" toggle butonu |
| `use-tour-guide.ts` | Guide state'i, trigger'lar, API çağrıları |

---

## 12. Değişecek / Eklenecek Dosyalar

### Mevcut — Tamamlandı ✅

| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/schemas/tour-manifest.ts` | AI alanları + hotelProfile eklendi |
| `src/lib/mocks/demo-tour.json` | v3 — AI metadata eklendi |
| `src/components/tour-player/TourPlayer.tsx` | 70/30 layout, TourGuidePanel entegrasyonu |
| `src/app/api/tour/chat/route.ts` | GPT-4o-mini, sunucu-taraflı manifest çekimi |
| `src/lib/tour/use-tour-guide.ts` | Proaktif tetikleyiciler, autoTour, nudge limiti |
| `src/components/tour-player/TourGuidePanel.tsx` | Panel UI |
| `src/components/tour-player/tour-guide-message.tsx` | Mesaj balonu |
| `src/components/tour-player/tour-guide-chips.tsx` | Chip satırı |
| `src/components/tour-player/auto-tour-button.tsx` | Otomatik tur toggle |

### Sırada — Faz 3+ (Hotel CMS)

| Dosya | Açıklama |
|-------|----------|
| `src/app/dashboard/[slug]/page.tsx` | Otel dashboard ana sayfa |
| `src/app/dashboard/[slug]/profil/page.tsx` | AI persona + facts + policies düzenleme |
| `src/app/dashboard/[slug]/tur/[tourId]/page.tsx` | Tur adım listesi |
| `src/app/dashboard/[slug]/tur/[tourId]/adim/[stepId]/page.tsx` | Adım medya + AI metadata düzenleme |
| `src/app/api/upload/route.ts` | Blob/S3 yükleme endpoint'i |
| `src/lib/db/hotels.ts` | DB sorgu fonksiyonları (getManifestFromDB vb.) |
| `src/lib/db/schema.ts` | Drizzle / Prisma şema tanımı |

---

## 13. Uygulama Fazları

### Faz 1 — Schema + API ✅ Tamamlandı

1. ~~`tour-manifest.ts`'e AI alanlarını ekle ve test et~~
2. ~~`demo-tour.json`'u AI metadata ile güncelle~~
3. ~~`/api/tour/chat` route'unu yaz (GPT-4o-mini + native fetch)~~
4. ~~`use-tour-guide.ts` hook'unu yaz (state + trigger logic)~~

### Faz 2 — Side Panel UI ✅ Tamamlandı

1. ~~`TourGuidePanel` ve alt bileşenlerini yaz~~
2. ~~`TourPlayer.tsx`'i 70/30 layout'a al~~
3. ~~Proaktif tetikleyicileri (stepStart, stepEnd, idle) bağla~~
4. ~~`aiThinking` / `aiSpeaking` animasyonlarını ekle~~

### Faz 3 — Uçtan Uca Test + Güvenlik Sağlamlaştırma ✅ Tamamlandı

1. ~~API route'da `availableSteps`, `hotelProfile`, `currentStepTitle` istemci alanlarını schema'dan tamamen kaldır~~ — `requestSchema` artık sadece navigasyon durumunu kabul eder
2. ~~`use-tour-guide.ts` callApi gövdesinden gereksiz alanları temizle~~ — istemci sadece `hotelSlug`, `tourId`, `currentStepId`, `stepsSeen`, `triggerReason`, `history`, `isAutoTour` gönderir
3. ~~`startAutoTour` fix~~ — `isAutoTourRef.current` artık senkron güncelleniyor, `trigger("tourStart")` anında çağrılıyor
4. ~~Nudge limiti fix~~ — otomatik tur aktifken nudge sınırı bypass edilir (narasyonun kesilmemesi için)
5. ~~Mobil layout~~ — `TourPlayer.tsx`'te `useMediaQuery` + Mantine `Drawer` ile tamamlandı
6. **Kalan:** `.env.local`'a `OPENAI_API_KEY` ekle ve ilk gerçek sohbet testi yap

### Faz 4 — Veritabanı Entegrasyonu

1. PostgreSQL şemasını oluştur (`hotels`, `tour_steps` tabloları)
2. `getDemoTourManifest()` → `getManifestFromDB(hotelSlug, tourId)` migration
3. Demo otel verisini seed script ile DB'ye aktar
4. `/api/tour/chat` route'u artık DB'den çeker — istemci API imzası değişmez

### Faz 5 — Otel Dashboard (Hotel CMS)

1. Auth sistemi kur (NextAuth / Clerk) — otel sahibi girişi
2. `/dashboard/[slug]/profil` — AI persona + facts + policies formu
3. `/dashboard/[slug]/tur/[tourId]` — adım listesi, sıralama (drag & drop)
4. `/dashboard/[slug]/tur/.../adim/[stepId]` — medya yükleme + AI metadata formu
5. Blob storage entegrasyonu (Vercel Blob veya S3) — video/fotoğraf yükleme

### Faz 6 — İleri Özellikler (MVP Sonrası)

- Çok dilli destek (kullanıcı dili otomatik algılanır)
- Embedding tabanlı FAQ RAG (çok sayıda politika varsa)
- Analytics dashboard — hangi sorular, hangi adımlar conversion'a dönüşüyor
- Mobil uygulama entegrasyonu

---

## 14. Analytics Potansiyeli

AI sayesinde aşağıdaki metrikler ölçülebilir hale gelir:

- **En çok ne soruluyor?** → Otel eksik içeriği görebilir ("fiyat neden hiç yok?")
- **Hangi adım inquiry'e dönüştürüyor?** → "Havuz videosu sonrası inquiry %40 artıyor"
- **Otomatik tur tamamlanma oranı** → Kullanıcı kaçıncı adımda interrupt etti?
- **Dil dağılımı** → Kullanıcılar Türkçe mi, İngilizce mi yazıyor?
- **Drop-off noktaları** → Kullanıcı nerede konuşmayı kesip sayfadan ayrıldı?

`stepKey` (mevcut manifest alanı) inquiry attribution için kullanılabilir.

---

## 15. Riskler ve Önlemler

| Risk | Önlem |
|------|-------|
| LLM latency (>2s) | Video durmaz; "düşünüyor..." spinner göster. Hedef: p95 < 2s |
| Hallucination | System prompt'ta sert kısıtlama; sadece sunucu tarafındaki otel verisi kullanılır |
| İstemci veri enjeksiyonu | `availableSteps` / `hotelProfile` istemciden kabul edilmez; sunucu bağımsız çeker |
| "Alan yok" durumu | AI: "Bu tur o alanı içermiyor, ama şunu gösterebilirim..." |
| Çok agresif satış | Nudge maks 3, aynı öneri 2 reddedilirse susturulur |
| Callout ile çakışma | `stepStart` AI mesajı callout `tSec` değerleriyle senkronize edilir |
| Mobil UX | Side panel → drawer geçişi, video tam genişlik korunur |
| Otel veri kalitesi | Dashboard'da zorunlu alanlar (aiDescription min 10 karakter), kayıt anında uyarı |

---

## 16. Gelecek Versiyonlar (Kapsam Dışı — MVP Sonrası)

- **Sesli giriş** (Web Speech API — Türkçe destekli)
- **Multimodal frame analizi** — "Bu tablonun üzerinde ne yazıyor?" → video karesi Claude'a gönderilir
- **Otel FAQs RAG** — Embedding tabanlı soru-cevap (çok sayıda politika varsa)
- **Kişiselleştirme** — Kullanıcının gördükleri hatırlanır, bir sonraki turda devam edilir
- **Çok dilli destek** — Kullanıcının dili otomatik algılanır, AI o dilde yanıt verir

---

*Bu belge `docs/plans/` altında yaşar. Güncellendiğinde tarih ve durum alanı değiştirilmeli.*
