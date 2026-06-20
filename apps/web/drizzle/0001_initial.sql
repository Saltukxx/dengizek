-- Dengizek — ilk migration
-- Neon / PostgreSQL üzerinde çalıştır

-- ---------------------------------------------------------------------------
-- hotels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  city            TEXT,
  country         TEXT,
  short_description TEXT,
  long_description  TEXT,
  image_url       TEXT,
  price_label     TEXT,

  -- AI profil
  ai_persona      TEXT NOT NULL DEFAULT 'Yapay Zeka Rehberi',
  ai_language     TEXT NOT NULL DEFAULT 'tr',
  ai_facts        TEXT[]  NOT NULL DEFAULT '{}',
  ai_policies     TEXT[]  NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- tour_steps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tour_steps (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_slug              TEXT NOT NULL REFERENCES hotels(slug) ON DELETE CASCADE,
  tour_id                 TEXT NOT NULL,
  step_id                 TEXT NOT NULL,
  title                   TEXT NOT NULL,
  kind                    TEXT NOT NULL,
  order_index             INT  NOT NULL,
  requires_user_continue  BOOLEAN NOT NULL DEFAULT FALSE,
  body                    TEXT,

  -- Medya (JSONB: {mode, src, startSec?, endSec?})
  media                   JSONB NOT NULL,
  captions_vtt_url        TEXT,
  narration_url           TEXT,
  step_key                TEXT,

  -- Tur yapısı (JSONB dizileri)
  branches    JSONB NOT NULL DEFAULT '[]',
  callouts    JSONB NOT NULL DEFAULT '[]',
  hotspots    JSONB NOT NULL DEFAULT '[]',

  -- AI metadata
  ai_tags         TEXT[]  NOT NULL DEFAULT '{}',
  ai_description  TEXT,
  ai_promo        TEXT[]  NOT NULL DEFAULT '{}',
  ai_visible      BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT tour_steps_unique UNIQUE (hotel_slug, tour_id, step_id)
);

-- updated_at otomatik güncelleme trigger'ı
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotels_updated_at ON hotels;
CREATE TRIGGER hotels_updated_at
  BEFORE UPDATE ON hotels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
