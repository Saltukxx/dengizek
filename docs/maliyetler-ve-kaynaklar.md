# Maliyetler ve resmi kaynaklar

Bu belge, Dengizek / GBSoft akıllı otel turu için kullanılan **maliyet varsayımlarının** dayandığı **resmi fiyat sayfalarını** listeler. Rakamlar **tahmini** olabilir; kesin fatura her zaman sağlayıcı konsoluna bağlıdır. Güncelleme için uygun tarih notlarıyla birlikte tutulmalıdır.

---

## Döviz


| Parametre | Varsayılan                     | Not                                                               |
| --------- | ------------------------------ | ----------------------------------------------------------------- |
| USD / TRY | Excel modelinde **40** (örnek) | Günlük kur için [TCMB](https://www.tcmb.gov.tr/kurlar/today.html) |


---

## Barındırma ve altyapı (üretim / geliştirme erken dönem)

Kaynak tablo özeti: `gbsoft-fiyat-modeli.xlsx` → **Sunucu_Barindirma** sayfası.


| Kalem                      | Birim / tipik tutar                                                                                 | Resmi kaynak                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **DigitalOcean Droplet**   | **$24/ay** (2 vCPU / 4 GB RAM) → **$48/ay** üretim (4 vCPU / 8 GB) — app + DB + Redis Docker içinde | [DO Droplet Pricing](https://www.digitalocean.com/pricing/droplets)            |
| **Postgres (self-hosted)** | Docker container, VPS içinde — **ayrı ücret yok**; pg_dump → R2 backup ile korunur                  | —                                                                              |
| **Redis (self-hosted)**    | Docker container, VPS içinde — **ayrı ücret yok**                                                   | —                                                                              |
| **Cloudflare R2**          | **~0,015 USD/GB-ay** (Standard); egress ücretsiz; pg_dump backup için de kullanılır                 | [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)         |
| **Bunny Stream**           | Encoding **ücretsiz** · Depolama **~0,01 USD/GB-ay** · Delivery **~0,005 USD/GB** (Avrupa/TR dahil) | [Bunny Stream Pricing](https://bunny.net/stream/)                              |
| **Resend** (e-posta)       | Ücretsiz kotadan ücretli planlara                                                                   | [Resend Pricing](https://resend.com/pricing)                                   |
| **Sentry**                 | Ücretsiz kotadan Team planına                                                                       | [Sentry Pricing](https://sentry.io/pricing/)                                   |
| **PostHog**                | Örn. **aylık 1M event** ücretsiz katman                                                             | [PostHog Pricing](https://posthog.com/pricing)                                 |
| **Upstash Redis**          | Ücretsiz katman veya PAYG / sabit planlar                                                           | [Upstash Pricing](https://upstash.com/pricing)                                 |


**Not:** Postgres ve Redis VPS’teki Docker container’larda çalışır, ayrı ücret yoktur. Videolar Bunny Stream’de, metadata Postgres’te tutulur. VPS video’ya dokunmaz.

---

## Canlı altyapı detay sayfası (Excel)


| Dosya                      | Sayfa                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `gbsoft-fiyat-modeli.xlsx` | **Canli_AltYapi** — parametreler (kur, katalog dakika, izlenen dakika), Stream formülleri, satır toplamları |


---

## Geliştirme araçları (abonelik)

Kaynak: **Geliştirme_Araclari** sayfası.


| Ürün                       | Yayınlanan fiyat (özet)                                                                                     | Kaynak                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Claude Max (5x)**        | **100 USD/ay** (kişi başı, web)                                                                             | [Claude Max plan](https://claude.com/pricing/max) · [Anthropic duyuru](https://www.anthropic.com/news/max-plan) |
| **Cursor Pro**             | **20 USD/ay** (yayınlanan Pro)                                                                              | [Cursor Pricing](https://cursor.com/pricing)                                                                    |
| **Anthropic API** (Claude) | Modele göre; örn. Sonnet **girdi ~3 USD / 1M token**, **çıktı ~15 USD / 1M token** (standart; güncel tablo) | [Anthropic API pricing](https://docs.anthropic.com/en/about-claude/pricing)                                     |
| **OpenAI API**             | Modele göre; **Whisper ~0,006 USD/dakika** (transkripsiyon) vb.                                             | [OpenAI API Pricing](https://openai.com/api/pricing)                                                            |


**Not:** Claude **Max** (sohbet/abonelik) ile **API** (kullanım başına) farklı ürünlerdir.

---

## Üretimde AI maliyeti (otel başı — müşteri hesabı varsayımı)

Kaynak: **AI_Uretim** sayfası; tur başına token ve STT/TTS dakikası ile çarpılır.


| Bileşen                  | Kullanılan birim fiyat (referans) | Kaynak                                                                      |
| ------------------------ | --------------------------------- | --------------------------------------------------------------------------- |
| LLM (örn. Claude Sonnet) | MTok başına ücretler              | [Anthropic API pricing](https://docs.anthropic.com/en/about-claude/pricing) |
| STT (Whisper)            | Dakika başına                     | [OpenAI API Pricing](https://openai.com/api/pricing)                        |
| TTS                      | Karakter veya model bazlı         | [OpenAI API Pricing](https://openai.com/api/pricing)                        |


Excel’de **hibrit senaryo** (Sonnet / Haiku karışımı) ve **otel başı aylık tur** varsayımı ile ölçeklenir; platform toplamı **Özet** sayfasındaki **hedef otel sayısı** ile çarpılır.

---

## Müşteri tarafı teklif (TL) — iş kararı

**Özet** sayfasındaki **devir bedeli** ve **bakım** rakamları (ör. A/B/C senaryoları) **pazarlık ve iş modeli** içindir; yukarıdaki SaaS/API listelerinden türetilmiş **maliyet katları** değildir. Güncellenince bu bölüm elle senkronize edilmelidir.

---

## Alternatif: Kendi VPS (DigitalOcean)

Bu mimaride **Vercel + Neon** yerine uygulama ve (isteğe bağlı) veritabanı DigitalOcean üzerinde çalışır. **Video encode/CDN** için tek bir küçük VPS yeterli olmayabilir; tur videoları için **Bunny Stream** kullanmak doğru mimari olur — VPS disk ve çıkan trafiği şişirmemek için.

### Resmi birim fiyatlar (DO)


| Ürün                        | Başlangıç / birim                                                                                                       | Kaynak                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Droplets (Basic)**        | Örn. **$4–96/ay** (512 MiB–16 GiB aralığı; örn. **2 vCPU / 4 GiB ≈ $24/ay**)                                            | [Droplet pricing](https://www.digitalocean.com/pricing/droplets)             |
| **Managed PostgreSQL**      | **~$15,15/ay**’dan (Basic 1 vCPU / 1 GiB örnek taban); daha büyük planlar artar                                         | [Managed Databases](https://www.digitalocean.com/pricing/managed-databases)  |
| **Spaces (object storage)** | Paket **$5/ay**: **250 GiB** depolama + **1 TiB** çıkış transferi; ek depolama **$0,02/GiB**, ek transfer **$0,01/GiB** | [Spaces pricing](https://www.digitalocean.com/pricing/spaces-object-storage) |
| **Load Balancer**           | **$12/ay**’dan                                                                                                          | [Genel fiyat özeti](https://www.digitalocean.com/pricing)                    |
| **Ağ çıkışı (Droplet)**     | Dahil kota aşılırsa **~$0,01/GiB** (sayfa genel bilgi)                                                                  | [DigitalOcean Pricing](https://www.digitalocean.com/pricing)                 |


### Üç örnek aylık tablo (USD, ücretler yaklaşık)


| Senaryo                            | İçerik                                                                                                                          | Kabaca toplam            | Not                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Tek Droplet (minimal)**      | Next.js + aynı VM’de Postgres + Redis (self-managed) · örn. **2 vCPU / 4 GiB** Droplet                                          | **~$24/ay** (+ alan adı) | En ucuz ham maliyet; **bakım, yedek, güvenlik güncellemesi** sizde.                                                                                       |
| **B — DO “hibrit” (sık önerilen)** | App: **2 vCPU / 4 GiB** Droplet (**~$24**) + **Managed Postgres** (~**$15,15** başlangıç) + **Spaces** (**$5**)                 | **~$44–50/ay**           | Neon/Vercel benzeri “ayrı DB” düzeni; uygulama sunucusunu siz yönetirsiniz.                                                                               |
| **C — Daha yüksek trafik**         | Örn. **4 vCPU / 8 GiB** (**~$48**) + Managed PG üst tier (~**$30–60** bandı) + Spaces (**$5**) + isteğe Load Balancer (**$12**) | **~$95–125/ay** ve üzeri | 150–500 otel **trafiği** ve eşzamanlı kullanıcı **sunucu boyutunu** belirler; otel sayısının kendisi doğrudan Droplet fiyatını çarpan olarak kullanılmaz. |


### Managed (Neon + Vercel) ile karşılaştırma (yüksek seviye)


| Boyut             | VPS / DO yaklaşımı                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Nakit**         | Ham Droplet + Managed DB ile çoğu zaman **aylık sabit USD** daha öngörülebilir ve bazı senaryolarda **daha düşük** olabilir. |
| **Gizli maliyet** | SSL yenileme, OS yaması, Postgres yedekleri, izleme, DDoS öncesi tasarım — **geliştirici/operasyon süresi**.                 |
| **Video**         | VPS’te videoyu **diskte tutmak** yerine **Bunny Stream** üzerinden sunmak maliyeti kontrol altında tutar; encoding ücretsiz, delivery ~$0.005/GB.             |


---

## Dosya referansları (repo)


| Dosya                                  | Açıklama                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `gbsoft-fiyat-modeli.xlsx`             | Özet, geliştirme araçları, sunucu, AI üretim, 24 ay senaryo, canlı altyapı |
| `scripts/update-excel-real-pricing.py` | Excel’e kaynak notları ve infra USD güncellemesi (tekrar çalıştırılabilir) |
| `scripts/fix-excel-dollar-display.py`  | Notlarda `$` görünüm düzeltmesi                                            |


---

## Sorumluluk reddi

Resmi sayfalar sık güncellenir. Tek doğruluk kaynağı her zaman **sağlayıcının güncel fiyat sayfası** ve **hesabınızdaki kullanım raporudur**. Bu MD dosyası planlama içindir; hukuki veya muhasebesel teklif olarak kullanılmamalıdır.