# ADR 003: Tur manifesti — etkileşim alanları ve sürümleme

**Durum:** kabul edildi  
**Tarih:** 2026-04-23

## Bağlam

Video turu; adımlar, klipler, dil ve pazarlama metinleri dışında **içeride sarma**, **zaman damgalı bilgi (callout)**, **yüzde konumlu hotspot** ve isteğe bağlı **dallanma** gerektiriyor. Tek sözleşme `tour-manifest` (Zod) üzerinden kalmalı.

## Karar

- **Geriye uyum:** Yeni alanlar `optional`. Eski JSON’lar parse edilmeye devam eder.
- **Klip penceresi:** `media.startSec` / `endSec` — oynatıcıda zorunlu; yoksa `[0, dosyaSüresi]`.
- **Callouts:** `callouts[]` — `{ id, tSec, title, body? }`; aynı adımda birden fazla; oynatıcı en son “açılmış” olanı gösterir.
- **Hotspots:** `hotspots[]` — `{ id, xPct, yPct, label, body?, tSec? }`; koordinatlar **video dikdörtgeni (object-fit: contain)** içinde yüzde; `tSec` sonrası görünür.
- **Dallanma (MVP):** `branches[]` — `{ id, label, nextStepId }`; etkileşimde tek “Devam” yerine düğmeler; `goToStepId` ile hedef adıma zıplama. Graph/çevrim sonraki iterasyon.
- **Sürümleme:** Önemli şema değişikliğinde manifest `version` artırılır; istemci en azından log/uyumluluk için okur.

## Sonuçlar

- İçerik üretimi: editör tarafında yüzde ve `tSec` doğruluğu gerekir.
- **Erişilebilirlik:** Hotspot pinlere `aria-label`; dallanma düğmeleri odak sırasına girer.

## Ele alınan alternatifler

- **Harici zaman çizelgesi dosyası:** İkinci kaynak; MVP’de manifest içinde tutuldu.
- **Tam graf tur:** `edges` tablosu — dallanma karmaşıklığı için ertelendi.
