-- ---------------------------------------------------------------------------
-- Tesis sezon kategorileri: "yaz" / "kis" (bkz. src/lib/schemas/hotel-content.ts)
--
-- Dizi olarak tutulur: bir tesis iki sezonda da hizmet verebilir. Boş dizi
-- "belirtilmedi" demektir — mevcut kayıtlar bu varsayılanla gelir ve misafir
-- yüzeyindeki sezon filtresine takılmaz.
-- ---------------------------------------------------------------------------

ALTER TABLE "hotels" ADD COLUMN IF NOT EXISTS "seasons" text[] DEFAULT '{}' NOT NULL;

-- Sezon filtresi dizi kapsama (&&, @>) ile çalışacak; GIN indeksi bunun içindir.
CREATE INDEX IF NOT EXISTS "hotels_seasons_idx" ON "hotels" USING GIN ("seasons");
