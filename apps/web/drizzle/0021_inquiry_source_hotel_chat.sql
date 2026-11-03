-- ---------------------------------------------------------------------------
-- Otel sayfası sohbetinden gelen talepler turdaki rehberden ayrı görünsün.
-- ---------------------------------------------------------------------------

ALTER TYPE "inquiry_source" ADD VALUE IF NOT EXISTS 'hotel_chat';
