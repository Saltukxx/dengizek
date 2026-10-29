-- ---------------------------------------------------------------------------
-- Reklam dönüşüm kodları (Google Ads / GA4) ve talep kaynağı.
--
-- ad_tags: platform admininin girdiği kimlikler. Kayıt ya genel bir sayfaya
-- (page_path) ya da bir otele (hotel_id) bağlıdır, ikisi birden değil.
-- inquiries.attribution: talebin geldiği reklam (gclid, utm_*, giriş sayfası).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ad_tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "page_path" text,
  "hotel_id" uuid REFERENCES "hotels"("id") ON DELETE CASCADE,
  "google_ads_id" text,
  "conversion_label" text,
  "ga4_id" text,
  "note" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ad_tags_one_target" CHECK (("page_path" IS NULL) <> ("hotel_id" IS NULL)),
  CONSTRAINT "ad_tags_has_id" CHECK ("google_ads_id" IS NOT NULL OR "ga4_id" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ad_tags_page_idx" ON "ad_tags" ("page_path");
CREATE INDEX IF NOT EXISTS "ad_tags_hotel_idx" ON "ad_tags" ("hotel_id");

ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "attribution" jsonb;
