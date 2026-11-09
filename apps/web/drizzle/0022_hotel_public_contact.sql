-- ---------------------------------------------------------------------------
-- Misafire gösterilen iletişim numaraları — otel sayfasındaki "Ara" ve
-- "WhatsApp" düğmeleri. Mevcut "phone" alanı yalnız Otelsayfam ekibine açık
-- kalır; misafire gösterilecek numarayı otel ayrıca ve isteyerek girer.
-- ---------------------------------------------------------------------------

ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "public_phone" text;
--> statement-breakpoint
ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "whatsapp_phone" text;
