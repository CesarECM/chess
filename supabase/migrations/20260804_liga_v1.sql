-- MPS #44 — Ligas Semanales v1
-- Run in Supabase SQL editor

-- 1. leagues
CREATE TABLE IF NOT EXISTS public.leagues (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elo_min    int  NOT NULL,
  elo_max    int  NOT NULL,
  week_start date NOT NULL,
  week_end   date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leagues_week ON public.leagues(week_start, elo_min, elo_max);

-- 2. league_members
CREATE TABLE IF NOT EXISTS public.league_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzles_week int  NOT NULL DEFAULT 0,
  rank         int,
  promoted     boolean NOT NULL DEFAULT false,
  demoted      boolean NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(league_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_league_members_user  ON public.league_members(user_id, league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_score ON public.league_members(league_id, puzzles_week DESC);

-- 3. RLS
ALTER TABLE public.leagues        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leagues_select_all"           ON public.leagues        FOR SELECT USING (true);
CREATE POLICY "league_members_select_all"    ON public.league_members FOR SELECT USING (true);
CREATE POLICY "league_members_insert_own"    ON public.league_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "league_members_update_own"    ON public.league_members FOR UPDATE USING (auth.uid() = user_id);

-- 4. RPC: leaderboard for current user's active league
CREATE OR REPLACE FUNCTION get_my_league_leaderboard()
RETURNS TABLE (
  league_id    uuid,
  week_start   date,
  week_end     date,
  member_id    uuid,
  user_id      uuid,
  elo          int,
  puzzles_week int,
  rank         int,
  is_me        boolean
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH my_league AS (
    SELECT lm.league_id
    FROM   public.league_members lm
    JOIN   public.leagues l ON l.id = lm.league_id
    WHERE  lm.user_id = auth.uid()
      AND  l.week_end >= CURRENT_DATE
    LIMIT 1
  ),
  ranked AS (
    SELECT
      lm.id           AS member_id,
      lm.user_id,
      lm.league_id,
      lm.puzzles_week,
      COALESCE(p.elo, 0) AS elo,
      RANK() OVER (ORDER BY lm.puzzles_week DESC)::int AS rank
    FROM  public.league_members lm
    LEFT  JOIN public.profiles p ON p.id = lm.user_id
    WHERE lm.league_id = (SELECT league_id FROM my_league)
  )
  SELECT
    r.league_id,
    l.week_start,
    l.week_end,
    r.member_id,
    r.user_id,
    r.elo,
    r.puzzles_week,
    r.rank,
    (r.user_id = auth.uid()) AS is_me
  FROM ranked r
  JOIN public.leagues l ON l.id = r.league_id
  ORDER BY r.rank;
$$;

-- 5. pg_cron weekly rotation — Sunday 23:59 UTC
-- Requires pg_cron extension enabled (Supabase: Database > Extensions > pg_cron)
SELECT cron.schedule(
  'liga-weekly-rotation',
  '59 23 * * 0',
  $$
    WITH ending AS (
      SELECT id FROM public.leagues WHERE week_end = CURRENT_DATE
    ),
    totals AS (
      SELECT league_id, COUNT(*)::int AS total
      FROM   public.league_members
      WHERE  league_id IN (SELECT id FROM ending)
      GROUP  BY league_id
    ),
    ranked AS (
      SELECT
        lm.id,
        lm.league_id,
        RANK() OVER (PARTITION BY lm.league_id ORDER BY lm.puzzles_week DESC)::int AS final_rank,
        t.total
      FROM public.league_members lm
      JOIN totals t ON t.league_id = lm.league_id
      WHERE lm.league_id IN (SELECT id FROM ending)
    )
    UPDATE public.league_members lm
    SET
      rank     = r.final_rank,
      promoted = r.final_rank <= GREATEST(1, r.total / 5),
      demoted  = r.final_rank > r.total - GREATEST(1, r.total / 5)
    FROM ranked r
    WHERE lm.id = r.id;
  $$
);
