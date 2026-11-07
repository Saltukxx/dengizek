# Termal vitrini — "Otelsayfam neden farklı?" pazarlama sayfası

**Tarih:** 4 Kasım 2026
**Durum:** Adım 0–5 uygulandı (4 Kasım 2026). Adım 6 (yaz/kış vitrinlerine uyarlama) bekliyor.
**Kapsam:** `/termal` ana sayfası. Beğenilirse aynı bileşenler yaz (`/`) ve kış (`/kis`) vitrinlerine uyarlanır.

## Amaç

Bugünkü termal banner bir fotoğraf, başlık ve arama kutusundan ibaret; Otelsayfam'ı diğer otel
sitelerinden ayıran hiçbir şeyi anlatmıyor. Yeni sayfa tek bir mesajı efekt ve animasyonla anlatır:

> **Diğer siteler fotoğraf gösterir. Otelsayfam oteli gezdirir ve sorularınızı otelin kendi
> bilgileriyle cevaplar.**

## Alınan kararlar

| Konu | Karar |
|------|-------|
| Banner görüntüsü | **Stok video** (telifsiz termal havuz / hamam / spa). Termal otellerde gerçek tur videosu yok; Oruçoğlu'ndaki tek tur 4 sn'lik demo klip. Görüntü üzerinde "Temsili video" etiketi bulunur. |
| AI doğruluk hatası | **Paralel ilerle.** Kahvaltı sorusuna check-out cevabı veren hata ayrı işte düzeltilir; banner işi beklemez. Yayına almadan önce düzelmiş olmalı (aşağıda "Yayın koşulları"). |
| "Kendin dene" canlı sohbet | **Evet, sınırlı.** Gerçek AI; ziyaretçi başına 3 soru. |
| Kapsam | **Önce termal**, sonra yaz ve kış vitrinleri. Bileşenler yüzeyden bağımsız yazılır. |

## Farkımız — sayfada anlatılacak gerçek özellikler

Hepsi bugün kodda var; sayfa yalnız var olanı anlatır.

1. **Etkileşimli video tur.** Duraklı tur (lobi → oda → havuz…), kendi hızında; "Oteli gezdir" ile otomatik tur.
2. **Tur sırasında AI rehber.** "Hamamı göster" denince video o durağa gider (`navigateTo` aracı).
3. **Uydurmayan cevap.** Cevaplar otelin panele girdiği bilgilerden gelir, "Doğrulanmış bilgi" kartıyla gösterilir. Bilgi yoksa "Bu konuda doğrulanmış bilgim yok, otele soralım" der.
4. **Doğal dille arama.** "Afyon'da çocuk havuzu olan termal otel".
5. **Sesli soru.** Mikrofonla sorma.
6. **Doğrudan talep.** Aracı yok, talep otele gider.

## Sayfa yapısı

### 1. Banner — canlı tur sahnesi
- **Sol:** Başlık ("Termal oteli gitmeden gezin, merak ettiğinizi sorun"), kısa açıklama, mevcut arama formu, güvence satırı.
- **Sağ:** Kendi kendine oynayan bir tur oynatıcı sahnesi (≈14 sn döngü):
  1. Stok termal havuz videosu oynar; alttaki durak şeridi dolar: Lobi → Termal havuz → Hamam → Oda.
  2. Misafir balonunda soru harf harf yazılır: "Termal havuzun suyu kaç derece?"
  3. "Yapay Zeka Rehberi" yazıyor animasyonu → cevap balonu → altında **Doğrulanmış bilgi** kartı yukarı kayarak açılır.
  4. "Hamamı göster" → video yumuşak geçişle hamam klibine geçer, şeritte "Hamam" durağı yanar.
- Sohbet metni sabit yazılmaz: sunucuda **yayındaki bir termal otelin gerçek bilgisinden** seçilir (örn. havuz sıcaklığı). Uygun bilgi yoksa genel ama doğru bir örnek kullanılır. Kartta bilginin geldiği otelin adı yazar; videoda "Temsili video" etiketi durur. Böylece hem görüntü hem bilgi dürüst kalır.
- Arka planda hafif buhar/ısı dalgası efekti (CSS gradyan + yavaş hareket), başlıkta sözcük sözcük beliren giriş.

### 2. "Klasik otel sitesi ile Otelsayfam" karşılaştırması
Kaydırıldıkça iki sütun yan yana canlanır:

| Klasik site | Otelsayfam |
|---|---|
| Fotoğraf galerisi | Duraklı video tur |
| Broşür metni | Soru sor, cevap al |
| "Bilgi için arayın" | Anında, kaynağı gösterilen cevap |
| Aracı ve komisyon | Otele doğrudan talep |

Her satırda sol taraf soluklaşır, sağ taraf vurgulanarak gelir.

### 3. "Yapay zekayı nerede kullanıyoruz?"
Ekranda sabit kalan sahne; kaydırdıkça dört adım sırayla değişir, her birinin küçük bir canlı animasyonu olur:
1. **Doğal dille arama:** Cümle yazılır, otel kartları süzülüp yerleşir.
2. **Turda yönlendirme:** "Hamamı göster" → durak değişir.
3. **Uydurmayan cevap:** Bilgi varsa kart, yoksa "Otele soralım" + talep düğmesi. Rakiplerden ayıran en güçlü nokta bu.
4. **Sesli soru:** Mikrofon ve ses dalgası.

### 4. "Kendin dene"
Seçili bir termal otel için gerçek mini sohbet (mevcut otel sayfası sohbet API'si). Hazır soru düğmeleri + serbest soru. Ziyaretçi başına 3 soru; sınır dolunca "Otel sayfasında sohbete devam edin" bağlantısı.

### 5. Rakamlar ve kapanış
Yalnız gerçek, veritabanından hesaplanan sayılar: yayındaki termal otel sayısı, bölge sayısı, video turlu otel sayısı. Ardından mevcut bölge kısayolları, öne çıkan oteller ve otel sahibi çağrısı.

## Teknik yaklaşım

- **Yeni kütüphane yok.** CSS keyframe ve geçişleri + küçük bir `useInView` (IntersectionObserver) kancası. Sahne adımları basit bir zamanlayıcı durum makinesiyle yürür.
- **Video:** Stok klipler sıkıştırılıp (`H.264 MP4` + `WebM`, ≤ 1.5 MB, 720p) `public/marketing/termal/` altına konur; `muted playsinline loop preload="metadata"`, poster görseli ile. Kaynak ve lisans `public/marketing/termal/KAYNAKLAR.md` dosyasında tutulur.
- **Performans:** Animasyon ve video yalnız ekranda görünürken oynar; sekme arka plandayken durur. Banner metni sunucuda render edilir, sahne istemci bileşenidir (LCP metin olur, videoyu beklemez).
- **Erişilebilirlik:** `prefers-reduced-motion` açıksa sahne animasyonsuz, son karede sabit gösterilir; video otomatik oynamaz. Sahne süs amaçlıdır (`aria-hidden`), aynı bilgi metin olarak da sayfada yer alır. Durdur/oynat düğmesi bulunur.
- **Mobil:** Sahne başlığın altına iner, sohbet balonları videonun üstüne biner; sabit kalan bölüm mobilde sıralı kartlara döner.
- **Canlı sohbet sınırı:** Sunucuda `src/lib/rate-limit.ts` ile IP + ziyaret kimliği başına sınır; istemcide kalan hak sayısı gösterilir.

## Adımlar

| Adım | İş | Çıktı |
|------|----|-------|
| 0 (paralel) | Kahvaltı → check-out hatasını düzelt; "kahvaltı saati", "havuz saati" sorularını doğruluk testlerine ekle | Hata kapanır, test kalıcı olur |
| 1 | Stok videoları seç, sıkıştır, lisans kaydı | `public/marketing/termal/` |
| 2 | Banner sahnesi (`ThermalHeroScene`) + gerçek bilgiden sohbet örneği seçen sunucu fonksiyonu | Yeni banner |
| 3 | Karşılaştırma bölümü + "Yapay zekayı nerede kullanıyoruz?" sabit kaydırma sahnesi | İki yeni bölüm |
| 4 | "Kendin dene" sohbeti + soru sınırı | Canlı demo |
| 5 | Rakamlar, mobil ince ayar, hareket azaltma, görsel regresyon ve erişilebilirlik testleri | Yayına hazır |
| 6 | Bileşenleri yaz ve kış vitrinlerine uyarla | Kapsam genişler |

## Yayın koşulları

- Adım 0'daki AI hatası düzelmiş ve testi geçiyor olmalı: sayfanın ana iddiası "uydurmayan cevap".
- Sayfada yüzdelik bir "doğruluk oranı" yayımlanmaz. Mevcut ölçüm (63 soruda %100) kahvaltı hatasını yakalamadı; soru seti genişleyene kadar bu rakam pazarlamada kullanılmaz.
- Stok videoların lisansı ticari kullanıma izin vermeli ve kaynakları kayıtlı olmalı.
- Görsel regresyon ve erişilebilirlik (WCAG 2.1 AA) testleri geçmeli.

## Uygulama notları (4 Kasım 2026)

- **Adım 0:** Ayrıntı sorularında ("Kahvaltı saat kaçta?") konu kartta geçmeli, saat/derece sorulduysa değer konuyla aynı satırda olmalı; hiçbir kartta yoksa sunucu "bilgim yok" der. Planlayıcı ölçümüne 4 saat sorusu eklendi (56 otel × 4).
- **Bulunan ek hatalar:** (1) DB istemcisi geliştirmede her yeniden yüklemede yeni havuz açıyordu → Postgres bağlantı sınırı doldu, otel verisi eksik yüklendi (ölçüm kararsızlığının da sebebi). `globalThis` + `idle_timeout` ile düzeltildi. (2) `body { overflow-x: hidden }` sitedeki tüm sticky öğeleri (üst menü, rezervasyon paneli) bozuyordu → `clip`.
- **Videolar:** Coverr (bkz. `apps/web/public/marketing/termal/KAYNAKLAR.md`). Coverr + Mixkit. Sahne durakları sorularla eşleşir: Termal havuz (havuz sorusu) → Spa ("Spayı göster") → Açık havuz ("Oteli gezdir"); sahne sorusu yalnız havuz konusundan seçilir.
- **Sahne diyaloğu:** `src/lib/marketing/thermal-demo.ts` — yayındaki termal otellerden rehberin aynı planlayıcısıyla seçilir (şu an Oruçoğlu, "Termal havuz kaç derece?").
- **Kendin dene:** Ziyaretçi başına saatte 3 soru + IP başına saatte 20 soru (sunucu), istemcide de 3 soru sınırı.

## Açık sorular

- Stok videoları ekip mi sağlayacak, yoksa telifsiz kütüphanelerden (Pexels, Pixabay vb.) seçim yapılıp onaya mı sunulacak?
- Gerçek bir termal otelden tur videosu çekimi planlanırsa banner o videoya geçirilir; tarih belli mi?
