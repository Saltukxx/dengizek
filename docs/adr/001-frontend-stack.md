# ADR 001: Ön yüke yığını (Dengizek `apps/web`)

**Durum:** kabul edildi  
**Tarih:** 2026-04-23

## Bağlam

Ürün, **Tailwind dışı** bir stil yaklaşımı, **erişilebilir** etkileşimli video turları ve bir **otel paneli** ile **Next.js (App Router)** ön yüzü gerektiriyor. Genel otel sayfalarında SEO önemli.

## Karar

- **UI iskeleti:** Düzen, formlar, tablolar, bildirimler ve tema **Mantine v7**. Araç-gereç sınıfı CSS’siz, tutarlı bileşen seti; React 19 / Next 15 ile uyumlu.
- **Tailwind / shadcn yok** — ürün yönü. PostCSS, Mantine ön ayarı ile.
- **İkonlar:** **Tabler** (`@tabler/icons-react`) — tek set.
- **Doğrulama:** manifest ve formlar için **Zod**; misafir talepleri **React Hook Form** + `@hookform/resolvers`.
- **Video arayüzü:** Etkin **özel kontroller** (oynat/duraklat, devam, altyazı) — kilitli adımlar, klavye ve altyazı için. HLS ve imzalı URL sonradan. Demo: herkese açık MP4.
- **Jeton yenileme:** `onRequestTokenRefresh` aralıkla **sahte**; canlıda kısa ömürlü oynatma URL’leri backend’den.
- **Platform `/admin`:** ertelendi; hız için otel arayüzü aynı uygulamada `/dashboard` altında.

## Sonuçlar

- **Paket boyutu:** Mantine, elle yazılan stillerden ağır; fakat teslimat hızı yüksek. İthalatları ve rota bölünmelerini sınırla.
- **SSR:** Kök `layout` içinde `MantineProvider` ve `ColorSchemeScript`. `TourPlayer` gibi bölümler `'use client'`.
- **Tema:** `src/theme/` — `createTheme`; görsel token kararları için bkz. ADR 002. Karanlık mod isterse `defaultColorScheme` tek satırla.

## Ele alınan alternatifler

- **MUI:** Geniş ekosistem; “boutique” pazarlama sayfalarında daha çok override.
- **Radix + Vanilla Extract:** Maksimum marka ayrımı; MVP öncesi daha çok layout işi.
