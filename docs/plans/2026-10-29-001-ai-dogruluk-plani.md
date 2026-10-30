---
title: AI Rehber Doğruluğu - Plan
type: feat
date: 2026-10-29
artifact_readiness: draft
execution: code
---

# AI Rehber Doğruluğu - Plan

## Amaç

Misafirin AI rehberden aldığı her cevap ya otelin verisiyle doğrulanabilir olsun ya da açıkça "bu bilgi bende yok" desin.
En kötü hata yanlış bilgi değil, **yanlış güven**: cevabı olmayan soruya alakasız bir kart gösterip "aşağıda görebilirsiniz" demek.

Kısıt: **Gemini ücretsiz katmanı** (şimdilik). Güçlü hakem modeli (3.5 Flash) günde ~20 istek; her adım bu sınıra göre tasarlanır.

Kapsam dışı: model sağlayıcı değişikliği, ses/TTS, yeni dil desteği.

---

## Başlangıç durumu (29 Ekim 2026)

| Ölçüm | Sonuç | Tarih | Güvenilirlik |
|---|---|---|---|
| Planlayıcı, offline (56 otel, 1.911 soru) | %99,8 | 26 Eki | Yüksek — model yok, kural testi |
| Otel arama, offline (229 sorgu) | %100 | 26 Eki | Şüpheli — sorgular sentetik |
| Uçtan uca, gerçek model (15 otel, 231 soru) | %88,3 | 25 Eki | **Düşük** — aşağıya bak |
| Golden sorular (seed, 56 fixture) | 1 uydurma / 8 model turu | 24 Eki | Orta |

Uçtan uca ölçüm neden güvenilmez:

1. 26 Ekim'deki doğruluk iyileştirmelerinden (`b41cc69`) **önce** alındı.
2. Güçlü hakem kotası dolduğu için 36 cevabı rehberin kendi modeli (Flash-Lite) denetledi, 21'i hiç denetlenmedi.
3. Denetlenemeyen cevap **geçti sayılıyor** (`judgeGrounding` → `{grounded: true, skipped: true}`) — doğruluk olduğundan yüksek görünüyor.
4. Hakem yalnız metni görüyor, kartı görmüyor: "detayları aşağıda görebilirsiniz" cümlesini uydurma sayıyor. `serbest-termal` %40'ın çoğu bu.
5. Gece eval iş akışı (`.github/workflows/ai-eval.yml`) hâlâ `OPENAI_API_KEY` bekliyor — Gemini'ye geçişten beri hiç çalışmadı.
6. Aktarılan otel verisi (`data/oteldenrezerve/`) git'te yok — CI bu otellerle ölçemez.

Ölçümün gösterdiği gerçek hatalar (yeniden ölçümle teyit edilecek):

- **Yanıltıcı kart:** giriş saati olmayan otelde politika kartı + "aşağıda görebilirsiniz". Misafir cevap aldığını sanıyor; soru cevapsızlar paneline de düşmüyor.
- **Oda kapasitesi %46:** "Standart Oda kaç kişilik?" → kartta "2 yetişkin" yok.
- **Olanak kaçağı:** "Kese var mı?", "Balkon var mı?" → araçsız ya da ilgisiz cevap. Balkon otel olanağı değil, oda özelliği.

---

## Aşama 0 — Güvenilir ölçüm

Bu aşama bitmeden hata düzeltmeye geçilmez; neyi düzelttiğimizi ölçemeyiz.

**0.1 Gece eval'ını çalışır hale getir**
- `ai-eval.yml`: `OPENAI_API_KEY` → `GEMINI_API_KEY` (gate + env).
- Eval anahtarı **ayrı bir Google AI Studio projesinden** — ücretsiz kota proje başına; eval canlı rehberin kotasını yemesin.
- CI yalnız golden set'i (seed otelleri) koşar: az model turu, kotaya sığar.

**0.2 Hakem kartı da görsün**
- `judgeGrounding`'e cevap metniyle birlikte gösterilen kartlar (`visibleText`) verilir; prompt'a "kart içeriği misafire gösterildi, karta yönlendiren cümle iddia değildir" kuralı eklenir.
- Yalnız karta yönlendiren cümlelerden oluşan cevap (somut iddia yok) hakeme hiç gönderilmez — kural tabanlı ön eleme. Kota tasarrufu.

**0.3 Hakem önbelleği**
- Karar, `hash(soru + cevap + kartlar + otel kaynak metni)` anahtarıyla `apps/web/.eval-cache/judge.json`'a yazılır (gitignore).
- Tekrar koşuda yalnız **yeni** cevaplar hakeme gider → günlük 20 istek sınırı pratikte yeter; büyük koşu gerekirse iki güne bölünür.

**0.4 Dürüst raporlama**
- `denetlenemedi` artık geçti sayılmaz; ayrı sütun ("bekliyor").
- Rehber modelinin kendini denetlemesi kaldırılır (fallback hakem yok); kota doluysa "bekliyor".
- Rapor iki sayı verir: **kesin kontroller** (kod tabanlı, her zaman) ve **hakem** (denetlenenler arasında).

**0.5 Yeni kontrol: yanıltıcı yönlendirme**
- `*-bilinmiyor` kategorilerinde: cevap ya `reply: "unknown"` olmalı ya da gösterilen kart sorunun konusunu içermeli. Konuyu içermeyen karta yönlendirme = hata.
- Konu tespiti için `KNOWN_TOPICS` (deterministic-tools) yeniden kullanılır — ayrı bir sözlük açılmaz.

**0.6 Taban ölçüm**
- Güncel `main` üzerinde uçtan uca eval yeniden koşulur, sonuç bu dosyaya "Taban" olarak işlenir.

Bitti sayılır: iki ardışık koşu ±2 puan içinde, `bekliyor` = 0, gece iş akışı yeşil.

---

## Aşama 1 — Bilinen hataları kapatma

Sıra taban ölçüme göre güncellenir; aşağıdaki öncelik tahmindir.

**1.1 Yanıltıcı kart koruması (öncelik 1)**
- Model `citeFact` ile kart gösterdiğinde: soru bilinen bir konuya (`KNOWN_TOPICS`) aitse ve kart o konunun kanıtını içermiyorsa → kart düşer, sabit "bu bilgi bende yok, otelden alabilirim" metni gider, soru `bilgi-yok` olarak cevapsızlara kaydedilir.
- Yer: `createCardPointerTransform` / `onFinish` hattı (`route.ts`). Sunucu turunda zaten çözülmüş durum; bu model turları için.

**1.2 Oda kapasitesi**
- Oda kartı (`room.<slug>.info`) kapasiteyi her zaman "N yetişkin (+ M çocuk)" biçiminde içersin.
- "kaç kişilik / kaç kişi kalır / how many people" sorusu + oda adı → planlayıcıda doğrudan o odanın kartı (model yok).

**1.3 Oda özellikleri ve olanak kaçakları**
- "Balkon / klima / minibar var mı?" → otel olanak listesinden önce oda özelliklerine bakılır; cevap "şu odalarda var".
- Olanak listesinde olmayan ama kaynak metinde geçen terimler (kese) için metin içi eşleşme kartı.

**1.4 Soru setini büyütme**
- Çok turlu takip soruları, yazım hataları, İngilizce/Almanca/Rusça, bir mesajda iki soru — aktarılan otellerle.
- Arama eval'ına gerçek misafir ifadelerine yakın, kural setinden bağımsız yazılmış sorgular (şu an %100 olması şüpheli).

Bitti sayılır: uçtan uca kesin kontroller ≥ %97, yanıltıcı yönlendirme = 0, hakem uydurma oranı ≤ %3.

---

## Aşama 2 — Veri kalitesi döngüsü

Rehber, elindeki veri kadar doğru olabilir. En büyük kaldıraç burada.

**2.1 Cevapsız sorudan bilgiye**
- Otel panelindeki cevapsız sorular listesinde "Cevap ekle": otelcinin yazdığı cevap "Otel ifadesi" etiketli fact olarak kataloğa eklenir, embedding senkronlanır, bir sonraki yayınla rehber kullanır.
- Aynı soru tekrar geldiğinde sayaç düşer — otelci etkisini görür.

**2.2 Kritik alan eksikleri**
- Hazırlık skoruna (`readiness-score.ts`) eklenir: giriş/çıkış saati, evcil hayvan kuralı, oda kapasiteleri, yeme-içme konsepti.
- Aktarım sonrası otel başına eksik alan raporu (admin).

Bitti sayılır: aktarılan otellerde kritik alan doluluğu raporlanıyor; otelci panelden cevap ekleyebiliyor.

---

## Aşama 3 — Canlı geri bildirim

**3.1 Misafir değerlendirmesi**
- Her rehber cevabının altında 👍/👎 → `trackEvent("ai_feedback")`; panelde ve admin'de listelenir.

**3.2 Gerçek sorulardan eval**
- Haftalık: 👎 alan ve cevapsız kalan sorular eval aday listesine; elle onaylanıp kişisel veri temizlenerek fixture olur.

---

## Aşama 4 — Model kararı

- Model yalnız serbest turlarda konuşuyor (~%15). Bu turlarda 3.5 Flash denenir; aynı eval ile doğruluk ve gecikme karşılaştırılır (3.5 Flash-Lite ölçümünde ~11 sn gecikme görüldü — kabul edilemez).
- Karar kuralı: doğruluk artışı ≥ 3 puan ve p50 gecikme ≤ 3 sn ise geçilir.
- Gerçek misafir trafiğinden önce **faturalandırma açılmalı**: ücretsiz katmanda misafir mesajları Google tarafından ürün geliştirmede kullanılıyor.

---

## Açık sorular

1. Eval için ayrı Google AI Studio projesi açılabilir mi? (Kota ayrımı için önerilir.)
2. Aktarılan otellerden küçük bir alt küme (ör. 5 otel) CI için repoya eklenebilir mi, yoksa CI yalnız seed otelleriyle mi kalsın?
3. 👍/👎 misafir arayüzüne şimdi mi eklensin, yoksa Aşama 1 sonrasına mı?
