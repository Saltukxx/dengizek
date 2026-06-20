# Moderasyon politikası — Dengizek

Bu belge, platform genelinde içerik moderasyonu, yorum onayı ve misafir güvenliği için geçerli kuralları özetler.

## Kapsam

- Otel ve tur içerikleri (`status`: taslak → incelemede → yayinda / reddedildi)
- Misafir yorumları (`status`: beklemede → yayinda / reddedildi)
- Admin denetim kaydı (`audit_log`)

## Otel ve tur moderasyonu

1. Yöneticiler içerik güncelledikten sonra **İncelemeye gönder** ile kuyruğa alır.
2. Platform yöneticisi onaylar veya red nedeni yazar.
3. **Otel profili/oda/fiyat** `yayinda` iken anında canlıdır; tur içeriği yalnızca `publishedManifest` snapshot ile misafire gider.
4. Yayında tur düzenlemek için **Yeni sürüm oluştur** → taslak → inceleme → onay akışı kullanılır.

## Yorum moderasyonu

1. Yorumlar varsayılan **beklemede** kalır.
2. Admin moderasyon API ile **yayinda** veya **reddedildi** kararı verir.

## Talep ve mesajlaşma

- Talepler otel üyelerine bildirim gönderir.
- Misafir portal token'ı e-posta ile iletilir.

## Sorumluluk

Platform yöneticisi nihai yayın kararını verir. Otel yöneticisi gönderdiği içerikten sorumludur.
