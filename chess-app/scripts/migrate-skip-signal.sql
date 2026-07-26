-- Migration: skip signal for puzzle_virality
-- Run once in Supabase SQL Editor after migrate-virality.sql.

ALTER TABLE puzzle_virality
  ADD COLUMN IF NOT EXISTS total_skips INT NOT NULL DEFAULT 0;

-- Atomic upsert: called when user swipes away without attempting the puzzle.
CREATE OR REPLACE FUNCTION record_skip(p_puzzle_id TEXT) RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO puzzle_virality (puzzle_id, total_skips)
  VALUES (p_puzzle_id, 1)
  ON CONFLICT (puzzle_id) DO UPDATE SET
    total_skips = puzzle_virality.total_skips + 1,
    updated_at  = NOW();
END;
$$ LANGUAGE plpgsql;
