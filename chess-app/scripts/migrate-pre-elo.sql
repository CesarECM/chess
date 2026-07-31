-- MPS #16 — preElo calibration migration
-- Run in Supabase SQL Editor

-- 1. Add preElo columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pre_elo_low  integer,
  ADD COLUMN IF NOT EXISTS pre_elo_high integer;

-- 2. Users NOT yet calibrated → start with full bounds
UPDATE profiles
SET pre_elo_low = 400, pre_elo_high = 3300
WHERE is_calibrated = false
  AND pre_elo_low IS NULL;

-- Users already calibrated → leave NULL (already done, no re-calibration)

-- 3. calibration_config table (dynamic bounds via pg_cron nightly)
CREATE TABLE IF NOT EXISTS calibration_config (
  id               integer PRIMARY KEY,
  lower_bound      integer NOT NULL DEFAULT 400,
  upper_bound      integer NOT NULL DEFAULT 3300,
  calibrated_count integer NOT NULL DEFAULT 0,
  last_updated     timestamptz NOT NULL DEFAULT now()
);

-- Seed initial row
INSERT INTO calibration_config (id, lower_bound, upper_bound, calibrated_count, last_updated)
VALUES (1, 400, 3300, 0, now())
ON CONFLICT (id) DO NOTHING;

-- 4. pg_cron nightly job: recalculate bounds once ≥100 users are calibrated
-- Requires pg_cron extension enabled in Supabase (Dashboard → Database → Extensions)
-- Uncomment after enabling pg_cron:
--
-- SELECT cron.schedule(
--   'calibration-bounds-nightly',
--   '0 3 * * *',
--   $$
--   DO $cron$
--   DECLARE
--     v_count bigint;
--     v_mean  numeric;
--     v_sd    numeric;
--   BEGIN
--     SELECT COUNT(*), AVG(elo), STDDEV(elo)
--       INTO v_count, v_mean, v_sd
--       FROM profiles
--      WHERE is_calibrated = true;
--
--     IF v_count >= 100 AND v_sd IS NOT NULL THEN
--       UPDATE calibration_config
--          SET lower_bound      = GREATEST(400,  ROUND(v_mean - 1.28 * v_sd)::int),
--              upper_bound      = LEAST(3300,    ROUND(v_mean + 1.28 * v_sd)::int),
--              calibrated_count = v_count,
--              last_updated     = now()
--        WHERE id = 1;
--     END IF;
--   END;
--   $cron$;
--   $$
-- );
