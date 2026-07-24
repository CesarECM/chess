-- S8.2: Historial de puzzles resueltos/fallados
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS puzzle_solve_events (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  puzzle_id  text        NOT NULL,
  solved     boolean     NOT NULL,
  tactic     text,
  rating     integer,
  elo_after  integer,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_solve_events_user_date
  ON puzzle_solve_events (user_id, created_at DESC);

-- RLS
ALTER TABLE puzzle_solve_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own history"
  ON puzzle_solve_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own history"
  ON puzzle_solve_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
