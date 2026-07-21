-- AI RAG embedding'leri ve misafir oturumları için eksik tablolar.
-- Bu tablolar schema.ts'te vardı ama migration'ı hiç üretilmemişti — yalnızca
-- `drizzle-kit push` kullanan ortamlar (CI/dev) görüyordu. SQL-tabanlı
-- deploy'lar için burada resmileştirildi. Idempotent yazıldı.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "hotel_fact_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hotel_slug" text NOT NULL,
  "fact_id" text NOT NULL,
  "content_hash" text NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "hotel_fact_embeddings_unique"
  ON "hotel_fact_embeddings" ("hotel_slug", "fact_id");

CREATE INDEX IF NOT EXISTS "hotel_fact_embeddings_vector_idx"
  ON "hotel_fact_embeddings" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "guest_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_token" text NOT NULL,
  "hotel_slug" text NOT NULL,
  "tour_id" text NOT NULL,
  "steps_seen" text[] DEFAULT '{}' NOT NULL,
  "last_step_id" text,
  "preferences" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "guest_sessions_token_hotel_tour_unique"
  ON "guest_sessions" ("session_token", "hotel_slug", "tour_id");

-- Sorgu şekline uygun eksik indeksler:
-- ai-metrics ve analytics rotaları hotel_id + created_at ile filtreler.
CREATE INDEX IF NOT EXISTS "analytics_hotel_created_idx"
  ON "analytics_events" ("hotel_id", "created_at");

-- Bildirim listesi user_id + okunmamış filtresiyle çekilir.
CREATE INDEX IF NOT EXISTS "user_notifications_user_unread_idx"
  ON "user_notifications" ("user_id") WHERE "read_at" IS NULL;

-- Medya temizlik kuyruğu: eşzamanlı cron çalışmalarında çifte silmeyi önlemek
-- için email_outbox ile aynı SKIP LOCKED + lease deseni kullanılır.
ALTER TABLE "media_cleanup_queue" ADD COLUMN IF NOT EXISTS "lease_until" timestamp;
