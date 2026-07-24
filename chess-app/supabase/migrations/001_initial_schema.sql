-- ============================================================
-- Migration 001 — Initial Schema
-- Chess Puzzle App — Sprint S1.2
-- ============================================================

-- ─── UTILITY FUNCTIONS ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── PROFILES ────────────────────────────────────────────────
-- Extends auth.users. Auto-created on signup via trigger.

CREATE TABLE public.profiles (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  is_guest         BOOLEAN     NOT NULL DEFAULT false,
  elo              INTEGER     NOT NULL DEFAULT 800,
  is_calibrated    BOOLEAN     NOT NULL DEFAULT false,
  is_premium       BOOLEAN     NOT NULL DEFAULT false,
  streak_current   INTEGER     NOT NULL DEFAULT 0,
  streak_longest   INTEGER     NOT NULL DEFAULT 0,
  last_played_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- Auto-create profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─── PUZZLES ─────────────────────────────────────────────────
-- Lichess open dataset. Public read for all (anon + authenticated).
-- virality_score populated in S5.4.

CREATE TABLE public.puzzles (
  id               TEXT        PRIMARY KEY,  -- Lichess puzzle ID
  fen              TEXT        NOT NULL,
  moves            TEXT[]      NOT NULL,     -- UCI notation
  rating           INTEGER     NOT NULL,
  rating_deviation INTEGER     NOT NULL DEFAULT 0,
  popularity       INTEGER     NOT NULL DEFAULT 0,
  themes           TEXT[]      NOT NULL DEFAULT '{}',
  game_url         TEXT,
  virality_score   NUMERIC     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_puzzles_rating   ON public.puzzles(rating);
CREATE INDEX idx_puzzles_themes   ON public.puzzles USING gin(themes);
CREATE INDEX idx_puzzles_virality ON public.puzzles(virality_score DESC);

-- RLS
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "puzzles_public_read"
  ON public.puzzles FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── USER PUZZLE PROGRESS ────────────────────────────────────
-- FSRS state per (user, puzzle) pair.

CREATE TABLE public.user_puzzle_progress (
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  puzzle_id        TEXT        NOT NULL REFERENCES public.puzzles(id)  ON DELETE CASCADE,
  stability        NUMERIC     NOT NULL DEFAULT 0,   -- FSRS: S
  difficulty       NUMERIC     NOT NULL DEFAULT 0,   -- FSRS: D
  retrievability   NUMERIC     NOT NULL DEFAULT 1,   -- FSRS: R
  repetitions      INTEGER     NOT NULL DEFAULT 0,
  last_rating      SMALLINT    CHECK (last_rating BETWEEN 1 AND 4),  -- 1=Again 2=Hard 3=Good 4=Easy
  last_reviewed_at TIMESTAMPTZ,
  next_review_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_id)
);

CREATE INDEX idx_progress_next_review
  ON public.user_puzzle_progress(user_id, next_review_at)
  WHERE next_review_at IS NOT NULL;

CREATE TRIGGER set_progress_updated_at
  BEFORE UPDATE ON public.user_puzzle_progress
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- RLS
ALTER TABLE public.user_puzzle_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_select_own"
  ON public.user_puzzle_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "progress_insert_own"
  ON public.user_puzzle_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "progress_update_own"
  ON public.user_puzzle_progress FOR UPDATE
  USING (auth.uid() = user_id);
