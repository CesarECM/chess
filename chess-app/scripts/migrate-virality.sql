-- Migration: puzzle_virality (aggregate engagement metrics per puzzle)
-- Run once in Supabase SQL Editor after migrate-fsrs.sql.

CREATE TABLE IF NOT EXISTS puzzle_virality (
  puzzle_id      TEXT        PRIMARY KEY,
  total_attempts INT         NOT NULL DEFAULT 0,  -- every play (including retries)
  total_failures INT         NOT NULL DEFAULT 0,  -- plays where user failed
  total_solves   INT         NOT NULL DEFAULT 0,  -- plays where user solved
  total_solve_ms BIGINT      NOT NULL DEFAULT 0,  -- sum of solve times (ms) for averaging
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Atomic upsert: called once per puzzle result (fire-and-forget from the client).
-- p_solve_ms is 0 when the puzzle was not solved.
CREATE OR REPLACE FUNCTION increment_virality(
  p_puzzle_id TEXT,
  p_solved    BOOLEAN,
  p_solve_ms  BIGINT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO puzzle_virality (puzzle_id, total_attempts, total_failures, total_solves, total_solve_ms)
  VALUES (
    p_puzzle_id,
    1,
    CASE WHEN NOT p_solved THEN 1 ELSE 0 END,
    CASE WHEN     p_solved THEN 1 ELSE 0 END,
    CASE WHEN     p_solved THEN p_solve_ms ELSE 0 END
  )
  ON CONFLICT (puzzle_id) DO UPDATE SET
    total_attempts  = puzzle_virality.total_attempts + 1,
    total_failures  = puzzle_virality.total_failures  + CASE WHEN NOT p_solved THEN 1 ELSE 0 END,
    total_solves    = puzzle_virality.total_solves    + CASE WHEN     p_solved THEN 1 ELSE 0 END,
    total_solve_ms  = puzzle_virality.total_solve_ms  + CASE WHEN     p_solved THEN p_solve_ms ELSE 0 END,
    updated_at      = NOW();
END;
$$ LANGUAGE plpgsql;
