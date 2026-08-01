-- ---------------------------------------------------------------------------
-- 0014 — Browse metin araması için trigram indeksleri
--
-- Arama artık SQL'de yapılıyor (bkz. getPublishedHotelsForBrowse). ILIKE
-- '%kelime%' sorguları B-tree indeksi kullanamaz; pg_trgm + GIN bunu
-- indekslenebilir hale getirir.
--
-- Sorgu snapshot-farkında: coalesce(published_snapshot->'hotel'->>'name', name).
-- Bu ifade üzerine de ayrı ifade-indeksleri kurulur, aksi halde planlayıcı
-- yalnızca ham kolon indekslerini kullanabilir.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Ham kolonlar (snapshot'ı olmayan eski kayıtlar)
CREATE INDEX IF NOT EXISTS "hotels_name_trgm_idx"    ON "hotels" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_city_trgm_idx"    ON "hotels" USING gin ("city" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_country_trgm_idx" ON "hotels" USING gin ("country" gin_trgm_ops);
--> statement-breakpoint

-- Yayındaki (snapshot-farkında) değerler — sorgunun birebir kullandığı ifadeler
CREATE INDEX IF NOT EXISTS "hotels_pub_name_trgm_idx" ON "hotels"
  USING gin ((coalesce("published_snapshot" -> 'hotel' ->> 'name', "name")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_pub_city_trgm_idx" ON "hotels"
  USING gin ((coalesce("published_snapshot" -> 'hotel' ->> 'city', "city")) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hotels_pub_country_trgm_idx" ON "hotels"
  USING gin ((coalesce("published_snapshot" -> 'hotel' ->> 'country', "country")) gin_trgm_ops);
