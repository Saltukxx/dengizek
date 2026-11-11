-- ---------------------------------------------------------------------------
-- iOS "fiyat düşünce haber ver": kaydedilen otele bağlı cihaz kimlikleri
-- (hesap yok). Günlük cron otelin "gecelik başlayan" fiyatını son görülen
-- fiyatla karşılaştırır; düşüşte APNs bildirimi gider. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "price_alert_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_id" uuid NOT NULL REFERENCES "hotels"("id") ON DELETE CASCADE,
  "device_token" text NOT NULL,
  "environment" text NOT NULL,
  "last_price_minor" integer,
  "last_notified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "price_alert_targets_hotel_token_unique"
  ON "price_alert_targets" ("hotel_id", "device_token");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "price_alert_targets_token_idx"
  ON "price_alert_targets" ("device_token");
