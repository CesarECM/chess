-- Migration: user_puzzle_progress (FSRS state per user+puzzle pair)
-- Run once in Supabase SQL Editor before using S4.3 features.

CREATE TABLE IF NOT EXISTS user_puzzle_progress (
  user_id          TEXT        NOT NULL,
  puzzle_id        TEXT        NOT NULL,
  stability        FLOAT       NOT NULL DEFAULT 0,
  difficulty       FLOAT       NOT NULL DEFAULT 0,
  retrievability   FLOAT       NOT NULL DEFAULT 1,
  state            SMALLINT    NOT NULL DEFAULT 0, -- 0=New 1=Learning 2=Review 3=Relearning
  lapses           INT         NOT NULL DEFAULT 0,
  learning_steps   INT         NOT NULL DEFAULT 0,
  repetitions      INT         NOT NULL DEFAULT 0,
  last_rating      SMALLINT    NOT NULL DEFAULT 3, -- 1=Again 2=Hard 3=Good 4=Easy
  last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_review_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, puzzle_id)
);

-- Index for the due-queue query (S4.4): all puzzles due for a user ordered by next review
CREATE INDEX IF NOT EXISTS idx_upp_user_due
  ON user_puzzle_progress (user_id, next_review_at);
