-- ---------------------------------------------------------------------------
-- Talep moderasyonu: misafir ile tesis arasındaki her mesaj (ilk talep dahil)
-- admin onayından geçmeden karşı tarafa teslim edilmez.
--
-- inquiries.approval_status  → ilk talebin (misafirin ilk mesajı) onayı. Otel
--   yöneticisi yalnız "onaylandi" talepleri görür.
-- inquiry_messages.approval_status → thread'deki her mesajın onayı.
--
-- Mevcut kayıtlar "onaylandi" olarak işaretlenir: yürürlükteki oteller
-- hâlihazırdaki taleplerini/yazışmalarını kaybetmez. Sütun varsayılanı yeni
-- kayıtlar için "bekliyor"; kod zaten her insert'te değeri açıkça yazar.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "message_approval" AS ENUM ('bekliyor', 'onaylandi', 'reddedildi');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "approval_status" "message_approval" DEFAULT 'bekliyor' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "rejected_reason" text;
--> statement-breakpoint

ALTER TABLE "inquiry_messages" ADD COLUMN IF NOT EXISTS "approval_status" "message_approval" DEFAULT 'bekliyor' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inquiry_messages" ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "inquiry_messages" ADD COLUMN IF NOT EXISTS "approved_at" timestamp;
--> statement-breakpoint
ALTER TABLE "inquiry_messages" ADD COLUMN IF NOT EXISTS "rejected_reason" text;
--> statement-breakpoint

-- Mevcut (bu migration'dan önce oluşmuş) kayıtları onaylanmış say.
UPDATE "inquiries" SET "approval_status" = 'onaylandi' WHERE "approved_at" IS NULL AND "created_at" < now();
--> statement-breakpoint
UPDATE "inquiry_messages" SET "approval_status" = 'onaylandi' WHERE "approved_at" IS NULL AND "created_at" < now();
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "inquiries_approval_idx" ON "inquiries" ("approval_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inquiry_messages_approval_idx" ON "inquiry_messages" ("approval_status");
