-- ---------------------------------------------------------------------------
-- Anonim ziyaret kimliği: aynı tarayıcı sekmesindeki soru, tur ve talep
-- olaylarını birbirine bağlar (yolculuk analizi). Rastgele UUID; isim, IP
-- ya da e-posta değildir. Eski olaylarda NULL kalır.
-- ---------------------------------------------------------------------------

ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "visit_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_visit_created_idx" ON "analytics_events" USING btree ("visit_id","created_at");
