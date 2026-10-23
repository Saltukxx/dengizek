-- ---------------------------------------------------------------------------
-- iCal içe aktarmanın bozduğu envanter satırlarını onarır.
--
-- Eski senkron, dış kanalın kapattığı geceye allotment = 0 yazıyor; gece
-- açılırken yalnız stop_sell'i geri alıyordu. Bu geceler "satışa açık ama 0
-- oda" kalıp bir daha satılamıyordu. Yeni senkron allotment'a dokunmaz.
--
-- Kalan sayı yeniden hesaplanır: birim sayısı − o geceyi tutan rezervasyonlar
-- (onaylı + gelmedi; gelmedi kaydı envanteri iade etmez).
-- ---------------------------------------------------------------------------

UPDATE "room_inventory" AS ri
SET "allotment" = GREATEST(0, COALESCE(r."unit_count", 0) - (
  SELECT count(*)::int
  FROM "bookings" b
  WHERE b."room_id" = ri."room_id"
    AND b."status" IN ('onaylandi', 'no_show')
    AND b."check_in" <= ri."date"
    AND ri."date" < b."check_out"
))
FROM "rooms" r
WHERE r."id" = ri."room_id"
  AND ri."source" = 'ical'
  AND ri."manual_override" = false
  AND ri."allotment" = 0
  AND ri."date" >= CURRENT_DATE;
--> statement-breakpoint

-- Açılmış geceler artık senkrona ait değil.
UPDATE "room_inventory"
SET "source" = 'system'
WHERE "source" = 'ical' AND "stop_sell" = false AND "manual_override" = false;
