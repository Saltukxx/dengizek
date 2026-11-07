-- ---------------------------------------------------------------------------
-- Analitik erişimi — yayın durumundan bağımsız, admin elle açar.
--
-- Otel "yayinda" olsa bile, admin bu bayrağı açmadıkça analitik sayfasını
-- göremez. Varsayılan false: analitik, admin panelinden açıkça açılana kadar
-- kapalıdır. Mevcut oteller de kapalı başlar (admin dilediğinde açar).
-- ---------------------------------------------------------------------------

ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "analytics_enabled" boolean DEFAULT false NOT NULL;
