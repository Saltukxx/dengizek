ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "child_age_prices" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "room_rates" ADD COLUMN IF NOT EXISTS "child_age_prices" jsonb DEFAULT '[]'::jsonb NOT NULL;
