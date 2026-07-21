ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "suspension_note" text;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reset_token_expires_at" timestamp;
