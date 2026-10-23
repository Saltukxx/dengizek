-- ---------------------------------------------------------------------------
-- Embedding modeli değişti: OpenAI text-embedding-3-small → Gemini
-- gemini-embedding-2 (aynı boyut: 1536). Eski vektörler yeni modelle
-- karşılaştırılamaz; silinir ve yeniden üretilir.
--
-- Migration'dan sonra: npm run db:backfill-embeddings
-- (O çalışana kadar sohbet kelime eşleşmesine dayalı aramaya düşer.)
-- ---------------------------------------------------------------------------

DELETE FROM "hotel_fact_embeddings";
