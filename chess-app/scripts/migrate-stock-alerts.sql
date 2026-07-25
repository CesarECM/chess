-- Migration: puzzle stock management system
-- Run in Supabase SQL Editor after migrate-virality.sql

-- ── 0. Habilitar pg_cron ───────────────────────────────────────────────────────
-- Requiere rol postgres (el SQL Editor de Supabase lo usa por defecto).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. stock_alerts ────────────────────────────────────────────────────────────
-- One row per rating band that has fallen below MIN_STOCK puzzles without
-- virality data. Truncated and rewritten on every pg_cron run.

CREATE TABLE IF NOT EXISTS stock_alerts (
  band_min    INT         NOT NULL,
  band_max    INT         NOT NULL,
  deficit     INT         NOT NULL,  -- puzzles to import to reach MIN_STOCK
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (band_min, band_max)
);

ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;
-- Service role only — clients have no direct access.

-- ── 2. check_puzzle_stock() ────────────────────────────────────────────────────
-- Counts puzzles per rating band that have no virality data (total_attempts < 1).
-- Inserts into stock_alerts when count < MIN_STOCK.
-- Called nightly by pg_cron.

CREATE OR REPLACE FUNCTION check_puzzle_stock() RETURNS VOID AS $$
DECLARE
  MIN_STOCK CONSTANT INT := 50;
  r         RECORD;
  cnt       INT;
BEGIN
  DELETE FROM stock_alerts WHERE detected_at IS NOT NULL;

  FOR r IN SELECT * FROM (VALUES
    (600,  800),
    (800,  1000),
    (1000, 1200),
    (1200, 1400),
    (1400, 1600),
    (1600, 1800),
    (1800, 2000),
    (2000, 3000)
  ) AS t(band_min, band_max) LOOP

    SELECT COUNT(*) INTO cnt
    FROM puzzles p
    WHERE p.rating >= r.band_min
      AND p.rating <  r.band_max
      AND NOT EXISTS (
        SELECT 1 FROM puzzle_virality v
        WHERE v.puzzle_id = p.id
          AND v.total_attempts >= 1
      );

    IF cnt < MIN_STOCK THEN
      INSERT INTO stock_alerts (band_min, band_max, deficit)
      VALUES (r.band_min, r.band_max, MIN_STOCK - cnt)
      ON CONFLICT (band_min, band_max) DO UPDATE
        SET deficit = EXCLUDED.deficit, detected_at = NOW();
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. pg_cron schedule ────────────────────────────────────────────────────────
-- Runs at 03:00 UTC every day.
-- pg_cron is enabled by default in Supabase (Extensions → pg_cron).

DO $$ BEGIN
  PERFORM cron.unschedule('check-puzzle-stock');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'check-puzzle-stock',
  '0 3 * * *',
  'SELECT check_puzzle_stock()'
);

-- ── Verificación manual ────────────────────────────────────────────────────────
-- Para probar sin esperar al cron:
--   SELECT check_puzzle_stock();
--   SELECT * FROM stock_alerts;
