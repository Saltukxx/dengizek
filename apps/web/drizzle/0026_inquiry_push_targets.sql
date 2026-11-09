-- ---------------------------------------------------------------------------
-- iOS bildirimleri: talebe bağlı cihaz kimlikleri (hesap yok). Yönetici talebe
-- cevap yazınca bu cihazlara APNs bildirimi gider. Tekrar çalıştırılabilir.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "inquiry_push_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "inquiry_id" uuid NOT NULL REFERENCES "inquiries"("id") ON DELETE CASCADE,
  "device_token" text NOT NULL,
  "environment" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "inquiry_push_targets_inquiry_token_unique"
  ON "inquiry_push_targets" ("inquiry_id", "device_token");
