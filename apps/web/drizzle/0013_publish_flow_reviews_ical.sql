-- ---------------------------------------------------------------------------
-- 0013 — Yayın akışı, misafir yorumları, iCal içe aktarma ve güvenlik temizliği
-- ---------------------------------------------------------------------------

-- 1) iCal feed'i bir odaya bağlar. İçe aktarılan meşguliyet bu odanın
--    envanterine "satışa kapalı" olarak yazılır; oda yoksa senkron atlanır.
ALTER TABLE "hotel_ical_feeds"
  ADD COLUMN IF NOT EXISTS "room_id" uuid;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "hotel_ical_feeds"
    ADD CONSTRAINT "hotel_ical_feeds_room_id_rooms_id_fk"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 2) Fiyat planı fiyatlarında kişi sayısına göre gecelik fiyat
--    (room_rates.occupancy_prices ile aynı kalıp).
ALTER TABLE "room_rate_plan_prices"
  ADD COLUMN IF NOT EXISTS "occupancy_prices" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

-- 3) Talep başına tek yorum — misafir portalı eşzamanlı gönderimlerde buna
--    güvenir. Kısmi index: inquiry_id NULL olan (otel girişli) yorumlar hariç.
--    Önce olası mükerrer kayıtları temizle (en eskisi kalır).
DELETE FROM "reviews" a
USING "reviews" b
WHERE a."inquiry_id" IS NOT NULL
  AND a."inquiry_id" = b."inquiry_id"
  AND a."created_at" > b."created_at";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "reviews_inquiry_unique"
  ON "reviews" ("inquiry_id")
  WHERE "inquiry_id" IS NOT NULL;
--> statement-breakpoint

-- 4) hotels.cancellation_rule_id için eksik FK. Önce artık var olmayan
--    kurallara işaret eden değerleri boşalt, sonra kısıtı ekle.
UPDATE "hotels" h
SET "cancellation_rule_id" = NULL
WHERE h."cancellation_rule_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "cancellation_rules" c WHERE c."id" = h."cancellation_rule_id"
  );
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "hotels"
    ADD CONSTRAINT "hotels_cancellation_rule_id_cancellation_rules_id_fk"
    FOREIGN KEY ("cancellation_rule_id") REFERENCES "cancellation_rules"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- 5) Düz metin portal token kolonunu düşür — token yalnızca hash'lenmiş
--    saklanır (access_token_hash). Kod bu kolona hiç yazmıyordu.
ALTER TABLE "inquiries" DROP COLUMN IF EXISTS "access_token";
