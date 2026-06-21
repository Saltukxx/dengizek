CREATE INDEX IF NOT EXISTS "hotels_status_idx" ON "hotels" ("status");
CREATE INDEX IF NOT EXISTS "hotel_members_user_idx" ON "hotel_members" ("user_id");
CREATE INDEX IF NOT EXISTS "bookings_hotel_created_idx" ON "bookings" ("hotel_id", "created_at");
CREATE INDEX IF NOT EXISTS "payments_hotel_created_idx" ON "payments" ("hotel_id", "created_at");
