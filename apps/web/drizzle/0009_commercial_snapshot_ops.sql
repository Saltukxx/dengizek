ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "published_revision" integer;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "access_token_hash" text;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp;
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "access_token_revoked_at" timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS "inquiries_access_token_hash_unique" ON "inquiries" ("access_token_hash");
ALTER TABLE "hotel_gallery_images" ADD COLUMN IF NOT EXISTS "object_key" text;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'verified_guest' NOT NULL;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "room_inventory" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "room_inventory" ADD COLUMN IF NOT EXISTS "manual_override" boolean DEFAULT true NOT NULL;
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "processing_at" timestamp;
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "lease_until" timestamp;
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "worker_id" text;

CREATE TABLE IF NOT EXISTS "media_cleanup_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "object_key" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "media_cleanup_pending_idx" ON "media_cleanup_queue" ("status", "next_attempt_at");

CREATE TABLE IF NOT EXISTS "booking_transitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "hotel_id" uuid NOT NULL REFERENCES "hotels"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "from_status" booking_status NOT NULL,
  "to_status" booking_status NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "booking_transition_idempotency_unique"
  ON "booking_transitions" ("booking_id", "idempotency_key");

UPDATE "room_inventory" SET "source" = 'manual', "manual_override" = true;
UPDATE "inquiries"
SET "access_token_expires_at" = COALESCE("created_at", now()) + interval '90 days'
WHERE "access_token" IS NOT NULL AND "access_token_expires_at" IS NULL;

CREATE OR REPLACE FUNCTION bump_hotel_draft_revision() RETURNS trigger AS $$
DECLARE target_hotel uuid;
BEGIN
  target_hotel := COALESCE(NEW.hotel_id, OLD.hotel_id);
  UPDATE hotels SET draft_revision = draft_revision + 1, updated_at = now() WHERE id = target_hotel;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'rooms','room_rates','restaurants','extras','hotel_gallery_images',
    'hotel_availability_notes','cancellation_rules','rate_plans',
    'room_rate_plan_prices','promotions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'bump_hotel_revision_' || table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION bump_hotel_draft_revision()', 'bump_hotel_revision_' || table_name, table_name);
  END LOOP;
END $$;
