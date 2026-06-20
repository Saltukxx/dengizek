ALTER TABLE "room_rates" ADD COLUMN IF NOT EXISTS "occupancy_prices" jsonb DEFAULT '[]'::jsonb NOT NULL;
