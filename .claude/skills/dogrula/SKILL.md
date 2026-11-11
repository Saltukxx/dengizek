---
name: dogrula
description: Otelsayfam değişikliklerini bitmiş saymadan önce doğrular — iOS (apps/ios) ve web (apps/web) için derleme, test, çeviri, mobil API uyumu ve yayın kuralları. Bir iş "tamam" denmeden, commit ya da TestFlight yüklemesinden önce ya da kullanıcı "doğrula / kontrol et / verify" dediğinde kullan.
---

# Otelsayfam doğrulama

Amaç: "bitti" demeden önce değişikliğin gerçekten çalıştığını kanıtlamak. Her
adımda komutu çalıştır, çıktısını oku, sonucu ona göre yaz. Çalıştırmadığın
bir kontrolü "geçti" diye yazma; "çalıştırılmadı, çünkü…" de.

## 1. Kapsamı belirle

`git status --short` ve `git diff --stat` ile neyin değiştiğine bak. Yalnız
değişen tarafın adımlarını uygula:

- `apps/ios/**` → 2. bölüm
- `apps/web/**` → 3. bölüm
- `apps/web/src/lib/mobile-api/**` ya da iOS `Models/`, `Networking/` → ayrıca 4. bölüm

## 2. iOS

Komutlar kök dizinden; simülatör adı sabit ("Otelsayfam iPhone").

1. **Proje dosyası.** `project.yml` değiştiyse `cd apps/ios && xcodegen generate`.
   `project.pbxproj` elle düzenlenmez: `project.yml` değişmeden `pbxproj`
   değişmişse bunu bulgu olarak yaz.
2. **Derleme ve birim testleri.**
   ```
   xcodebuild test -project apps/ios/Otelsayfam.xcodeproj -scheme Otelsayfam \
     -destination 'platform=iOS Simulator,name=Otelsayfam iPhone' \
     -only-testing:OtelsayfamTests
   ```
   Proje Swift 6 ve `SWIFT_STRICT_CONCURRENCY: complete` ile derlenir: yeni
   uyarı da bulgudur. Gerekçesi yorumda yazmayan `@unchecked Sendable`,
   `nonisolated(unsafe)` ve `MainActor.assumeIsolated` eklemelerini işaretle.
3. **Arayüz testleri.** Görünüm, gezinme ya da talep akışı değiştiyse aynı
   komutu `-only-testing:OtelsayfamUITests` ile çalıştır. Yerel sunucu ister:
   kökte `docker compose up -d postgres`, `apps/web` içinde `npm run dev`.
   Sunucu ayakta değilse testleri başarısız sayma; "sunucu yok, çalıştırılmadı"
   yaz.
4. **Çeviriler.** Kullanıcıya görünen yeni ya da değişen her metin dört dilde
   (tr, en, de, ru) olmalı. `cd apps/ios && python3 scripts/translations.py`
   çalıştır (argüman verme); betik eksik anahtarları listeler. Liste boş
   değilse bulgu. xcodebuild kataloğu kendiliğinden güncellemez.
5. **iPad.** Düzen değiştiyse "Otelsayfam iPad" simülatöründe
   `LayoutUITests` çalıştır.
6. **Gizlilik bildirimi.** Yeni bir "required reason" API'si (dosya zaman
   damgası, disk alanı, sistem açılış süresi, `UserDefaults` dışı benzerleri)
   ya da sunucuya gönderilen yeni bir kişisel veri türü eklendiyse
   `Otelsayfam/Resources/PrivacyInfo.xcprivacy` güncellenmiş olmalı.
7. **İzin metinleri.** Yeni bir izin (konum, kamera, fotoğraf…) kullanılıyorsa
   `project.yml` içinde açıklama anahtarı ve `InfoPlist.xcstrings` içinde dört
   dilde çevirisi olmalı.

## 3. Web

`apps/web` içinde, CI ile aynı sırayla (`.github/workflows/backend-ci.yml`):

```
npm run lint
npx tsc --noEmit
npm run test:ci
```

- `src/lib/db/schema.ts` değiştiyse `drizzle/` altında karşılığı olan bir
  göç dosyası olmalı (`npm run db:generate`). Sütun silen ya da tür
  değiştiren göçü ayrıca işaretle.
- Misafir sayfaları değiştiyse `npm run test:e2e:core`; görsel değişiklikte
  `npm run test:e2e:a11y` ve `npm run test:e2e:visual`.

## 4. Mobil API uyumu

Mağazadaki eski uygulama sürümleri eski yanıtı bekler, yeni uygulama da eski
sunucuya denk gelebilir.

- `apps/web/src/lib/mobile-api/v1.ts` içindeki değişiklik yalnız ekleme
  olmalı: alan silmek, yeniden adlandırmak ya da türünü değiştirmek bulgudur.
- iOS modeline eklenen her yeni alan, sunucuda yokken de çözülebilmeli
  (isteğe bağlı ya da varsayılanlı; örnek: `HotelCard.highlights`).
- `npx vitest run src/lib/mobile-api` çalıştır.

## 5. Yayın kuralları (TestFlight / App Store öncesi)

Bunlar şu an bilinen geçici durumlardır; her doğrulamada durumu bildir,
App Store gönderiminden önce hepsi kapanmış olmalı:

- Release `OTS_API_BASE_URL` `https://` olmalı (şu an şifresiz önizleme sunucusu).
- Derlenen `Info.plist` içinde `NSAllowsArbitraryLoads` olmamalı (uygulama ve widget).
- `aps-environment` yetkisi açık olmalı; yoksa bildirim ve fiyat alarmı cihazda çalışmaz.
- App Group yetkisi yalnız simülatöre bağlı olmamalı; yoksa widget cihazda boş kalır.
- `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` önceki yüklemeden büyük olmalı.

Bu listeye yeni bir geçici izin ya da istisna eklenmişse açıkça yaz.

## 6. Rapor

Kısa bir tablo ver: kontrol · çalıştırılan komut · sonuç (geçti / başarısız /
çalıştırılmadı + neden). Başarısız olanlar için dosya ve satır, ardından
düzeltme önerisi. Kullanıcı düzeltme istemediyse kodu değiştirme; yalnız
raporla. Düzeltme yaptıysan ilgili adımı yeniden çalıştırıp sonucu güncelle.
