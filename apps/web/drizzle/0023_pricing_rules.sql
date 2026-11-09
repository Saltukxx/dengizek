-- ---------------------------------------------------------------------------
-- Fiyat kuralları: koşullu dönem fiyatı ve kal-öde kampanyaları.
--
-- room_rates: dönem yalnız belirli gecelerde (weekdays: 0 Pazar … 6
-- Cumartesi) ya da belirli konaklama sürelerinde (stay_min/max_nights)
-- geçerli olabilir — ör. "Cuma-Cumartesi", "Cumartesi tek gece", "en az 3
-- gece" fiyatı. Boş alan → koşul yok (eski davranış).
--
-- promotions: "4 kal 3 öde" türü basamaklar (stay_pay_tiers) ve ücretsiz
-- gecenin hangi geceden düşüleceği (free_night_rule). Kal-öde kampanyasında
-- yüzde indirim olmadığı için discount_percent boş olabilir.
-- ---------------------------------------------------------------------------

ALTER TABLE "room_rates" ADD COLUMN IF NOT EXISTS "weekdays" integer[];
--> statement-breakpoint
ALTER TABLE "room_rates" ADD COLUMN IF NOT EXISTS "stay_min_nights" integer;
--> statement-breakpoint
ALTER TABLE "room_rates" ADD COLUMN IF NOT EXISTS "stay_max_nights" integer;
--> statement-breakpoint
ALTER TABLE "promotions" ALTER COLUMN "discount_percent" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "stay_pay_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "free_night_rule" text;
--> statement-breakpoint
-- Kampanya koşulları: en fazla gece, rezervasyonun yapılabileceği tarih
-- aralığı (ör. "son rezervasyon 21 Kasım") ve oda tipi başına gecelik
-- kampanya kontenjanı.
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "max_nights" integer;
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "bookable_from" date;
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "bookable_to" date;
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "allotment" integer;
--> statement-breakpoint
-- Rezervasyonun hangi kampanyayla satıldığı — kampanya kontenjanı bundan sayılır.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "promotion_id" uuid REFERENCES "promotions"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_promotion_idx" ON "bookings" ("promotion_id");
