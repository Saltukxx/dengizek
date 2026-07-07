ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "draft_revision" integer DEFAULT 1 NOT NULL;
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "submitted_revision" integer;
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "submitted_snapshot" jsonb;
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "published_snapshot" jsonb;

ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "draft_revision" integer DEFAULT 1 NOT NULL;
ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "submitted_revision" integer;
ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "submitted_manifest" jsonb;

CREATE TABLE IF NOT EXISTS "email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "to_address" text NOT NULL,
  "subject" text NOT NULL,
  "text_body" text NOT NULL,
  "html_body" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "email_outbox_pending_idx" ON "email_outbox" ("status", "next_attempt_at");
WITH ranked_defaults AS (
  SELECT id, row_number() OVER (PARTITION BY hotel_id ORDER BY created_at, id) AS rn
  FROM rate_plans WHERE is_default = true
)
UPDATE rate_plans SET is_default = false
WHERE id IN (SELECT id FROM ranked_defaults WHERE rn > 1);
CREATE UNIQUE INDEX IF NOT EXISTS "rate_plans_one_default_per_hotel" ON "rate_plans" ("hotel_id") WHERE "is_default" = true;

-- Tenant bütünlüğü için composite aday anahtarlar ve geriye uyumlu NOT VALID FK'ler.
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_id_hotel_unique" ON "rooms" ("id", "hotel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "rate_plans_id_hotel_unique" ON "rate_plans" ("id", "hotel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "inquiries_id_hotel_unique" ON "inquiries" ("id", "hotel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cancellation_rules_id_hotel_unique" ON "cancellation_rules" ("id", "hotel_id");

DO $$ BEGIN
  ALTER TABLE "room_inventory" ADD CONSTRAINT "room_inventory_room_hotel_fk"
    FOREIGN KEY ("room_id", "hotel_id") REFERENCES "rooms"("id", "hotel_id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "hotel_gallery_images" ADD CONSTRAINT "gallery_room_hotel_fk"
    FOREIGN KEY ("room_id", "hotel_id") REFERENCES "rooms"("id", "hotel_id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_hotel_fk"
    FOREIGN KEY ("room_id", "hotel_id") REFERENCES "rooms"("id", "hotel_id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rate_plan_hotel_fk"
    FOREIGN KEY ("rate_plan_id", "hotel_id") REFERENCES "rate_plans"("id", "hotel_id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_inquiry_hotel_fk"
    FOREIGN KEY ("inquiry_id", "hotel_id") REFERENCES "inquiries"("id", "hotel_id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_cancellation_hotel_fk"
    FOREIGN KEY ("cancellation_rule_id", "hotel_id") REFERENCES "cancellation_rules"("id", "hotel_id") NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mevcut yayınları koruyan geriye uyumlu backfill. Otel snapshot'ı uygulama
-- tarafından ilk submit/publish sırasında tam içerikle yeniden üretilecektir.
UPDATE "hotels"
SET "published_snapshot" = jsonb_build_object(
  'id', id, 'slug', slug, 'name', name, 'city', city, 'country', country,
  'shortDescription', short_description, 'longDescription', long_description,
  'imageUrl', image_url, 'priceLabel', price_label, 'starRating', star_rating,
  'amenities', amenities
)
WHERE status = 'yayinda' AND published_snapshot IS NULL;

UPDATE "tours"
SET "submitted_manifest" = "published_manifest",
    "submitted_revision" = "draft_revision"
WHERE "published_manifest" IS NOT NULL AND "submitted_manifest" IS NULL;
