-- ---------------------------------------------------------------------------
-- Konaklama takibi: giriş ve çıkış anı.
--
-- booking_status enum'una yeni değer eklenmez; onaylı rezervasyon "onaylandi"
-- kalır, fiilen giriş/çıkış yapıldığı bu iki sütundan okunur. Çakışma, iCal ve
-- ödeme kuralları onaylı kaydı aynı görmeye devam eder.
-- ---------------------------------------------------------------------------

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "checked_in_at" timestamp;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "checked_out_at" timestamp;

-- Takvim ve "bugün" sorguları tarih aralığıyla okur.
CREATE INDEX IF NOT EXISTS "bookings_hotel_stay_idx" ON "bookings" ("hotel_id", "check_in", "check_out");
