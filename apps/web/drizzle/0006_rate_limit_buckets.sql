CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "bucket_key" text NOT NULL,
  "name" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_buckets_key_name_unique"
  ON "rate_limit_buckets" ("bucket_key", "name");
