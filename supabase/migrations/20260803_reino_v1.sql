-- MPS #43 — El Reino v1
-- Run in Supabase SQL editor

-- 1. crowns_log
CREATE TABLE IF NOT EXISTS public.crowns_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id   text NOT NULL,
  crown_type  text NOT NULL CHECK (crown_type IN ('gold', 'silver', 'bronze')),
  earned_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crowns_log_user ON public.crowns_log(user_id);

-- 2. hall_progress
CREATE TABLE IF NOT EXISTS public.hall_progress (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hall_id       text NOT NULL,
  level         int  NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 7),
  puzzles_count int  NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hall_id)
);

-- 3. museum_items
CREATE TABLE IF NOT EXISTS public.museum_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     text NOT NULL,
  hall_id     text,
  item_type   text NOT NULL CHECK (item_type IN ('medal', 'painting', 'sculpture', 'trophy', 'board', 'special')),
  source      text NOT NULL CHECK (source IN ('hall_level', 'seasonal', 'league')),
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_museum_items_user ON public.museum_items(user_id);

-- 4. crystal_log
CREATE TABLE IF NOT EXISTS public.crystal_log (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crystal_log_user ON public.crystal_log(user_id);

-- 5. puzzle_solve_times (raw per user per puzzle)
CREATE TABLE IF NOT EXISTS public.puzzle_solve_times (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id text NOT NULL,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time_ms   int  NOT NULL,
  solved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pst_puzzle ON public.puzzle_solve_times(puzzle_id);

-- 6. puzzle_speed_stats (aggregate percentiles, updated by RPC/trigger)
CREATE TABLE IF NOT EXISTS public.puzzle_speed_stats (
  puzzle_id    text PRIMARY KEY,
  p50_ms       int,
  p60_ms       int,
  p70_ms       int,
  sample_count int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 7. lives_state
CREATE TABLE IF NOT EXISTS public.lives_state (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_lives     int  NOT NULL DEFAULT 5,
  max_lives         int  NOT NULL DEFAULT 5,
  last_recharge_at  timestamptz NOT NULL DEFAULT now(),
  speed_bonus_today int  NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE public.crowns_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hall_progress      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.museum_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crystal_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzle_solve_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzle_speed_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lives_state        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their crowns"         ON public.crowns_log         FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their hall_progress"  ON public.hall_progress      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their museum_items"   ON public.museum_items       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their crystals"       ON public.crystal_log        FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own their solve_times"    ON public.puzzle_solve_times FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "speed stats readable by all"    ON public.puzzle_speed_stats FOR SELECT USING (true);
CREATE POLICY "users own their lives"          ON public.lives_state        FOR ALL USING (auth.uid() = user_id);
