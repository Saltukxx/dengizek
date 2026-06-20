# ADR 002: Görsel dil ve tasarım token’ları (butik lüks)

**Durum:** kabul edildi  
**Tarih:** 2026-04-23

## Bağlam

MVP arayüzü işlevsel olsa da “pazaryeri + ürün” seviyesine çıkmak için **tutarlı marka dili** (palet, tipografi, yoğunluk) ve **ortak pazarlama bileşenleri** gerekiyor. ADR 001 (Mantine, Tailwind yok) geçerli; bu ADR yalnızca **tema ve bileşen prensiplerini** sabitler.

## Karar

- **Görsel yön:** Butik lüks — **sıcak nötr** zemin, **derin, doygun** birincil vurgu, başlıklarda **hafif serif**, gövdede **net sans** (`next/font` ile yükleme).
- **Uygulama yolu:** `createTheme` + `MantineProvider`; özel renk skalası `colors.brand` (10 kademe) ve `primaryColor: "brand"`. Parça parça global CSS: **sayfa zemin rengi**, `::selection`, `prefers-reduced-motion` ile agresif animasyon yok (ürün kendi hareketlerini yönetir).
- **Erişilebilirlik:** Metin/arka plan **WCAG 2.1** için pratik sınır: ana metin + nötr / `dimmed` tonları birlikte yeterli kontrastı korur; birincil düğmelerde `primaryShade` koyu uç tercih edilir.
- **Mantine `components` override:** `Button`, `Card`, `Paper`, ihtiyaca `AppShell` — tutarlı yarıçap ve boyut; pazarlama ve panel **aynı token**lardan beslenir; panelde yoğunluk biraz **daha kompakt** uygulanır (iç uygulama hissi).
- **Kopya dili:** **Türkçe**; bu ADR metin değişikliği getirmez, yalnızca hiyerarşi (başlık/alt metin) ile uyumlu bırakmayı hedefler.

## Sonuçlar

- **Bakım:** Renk/ font değişikliği `src/theme` + `layout` font değişkenlerinde toplanır.
- **E2E:** Görsel değişiklikler ağırlıkla stil; metin/rol tabanlı testler aynı kalır veya sınırlı güncellenir.

## Ele alınan alternatifler

- **CSS-in-JS (Panda, Vanilla Extract):** Daha yüksek marka ayrımı; ADR 001 ile tutarlılık için ertelendi.
- **Her sayfada lokal stil:** Hızlı başlangıç; tutarsız “basic” arayüz — reddedildi.
