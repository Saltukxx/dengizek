# Moderasyon politikası — Dengizek

Bu belge, platform genelinde içerik moderasyonu, yorum onayı ve misafir güvenliği için geçerli kuralları özetler.

## Kapsam

- Otel ve tur içerikleri (`status`: taslak → incelemede → yayinda / reddedildi)
- Misafir yorumları (`status`: beklemede → yayinda / reddedildi)
- Admin denetim kaydı (`audit_log`)

## Otel ve tur moderasyonu

1. Yöneticiler içerik güncelledikten sonra **İncelemeye gönder** ile kuyruğa alır.
2. Platform yöneticisi onaylar veya red nedeni yazar.
3. Yayında içerik düzenlendiğinde durum otomatik değişmez; yeni sürüm tur akışında ayrı yönetilir.
4. Reddedilen kayıtlar misafir tarafında görünmez.

## Yorum moderasyonu

1. Misafir veya otel panelinden eklenen yorumlar varsayılan olarak **beklemede** kalır.
2. Admin `/api/admin/reviews/[id]/moderation` ile **yayinda** veya **reddedildi** kararı verir.
3. Otel yöneticisi yalnızca **yanıt** ekleyebilir; yayın kararı admin yetkisindedir (MVP).

## Talep ve mesajlaşma

- Talepler otel üyelerine bildirim gönderir.
- Misafir portal token'ı e-posta ile iletilir; token paylaşımı misafir sorumluluğundadır.
- Otel yanıtları misafire e-posta ile bildirilir (Resend yapılandırıldığında).

## Red ve itiraz

- Red nedeni `moderationNote` alanında saklanır ve panele gösterilir.
- İtiraz süreci MVP'de manuel destek kanalı üzerinden yürütülür.

## Veri saklama

- Denetim kayıtları silinen kullanıcıdan bağımsız `actorEmail` ile tutulur.
- Analytics olayları kişisel veri içermeyecek şekilde tasarlanmalıdır.

## Sorumluluk

Platform yöneticisi nihai yayın kararını verir. Otel yöneticisi gönderdiği içerikten sorumludur.
