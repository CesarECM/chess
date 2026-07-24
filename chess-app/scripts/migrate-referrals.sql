-- S10: Sistema de Referidos
-- Run in Supabase SQL Editor

-- Add premium_until to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_until timestamptz;

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id   uuid REFERENCES auth.users NOT NULL,
  referred_id   uuid REFERENCES auth.users NOT NULL,
  ref_code      text NOT NULL,
  puzzle_count  int DEFAULT 0 NOT NULL,
  activated     boolean DEFAULT false NOT NULL,
  created_at    timestamptz DEFAULT now() NOT NULL,
  UNIQUE (referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referred  ON referrals (referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_ref_code  ON referrals (ref_code);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ── RPC: register_referral ─────────────────────────────────────────────────
-- Looks up referrer from ref_code (first 8 chars of UUID without dashes),
-- then inserts the referral row. Returns true if registered.
CREATE OR REPLACE FUNCTION register_referral(p_ref_code text, p_referred_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  SELECT id INTO v_referrer_id
  FROM auth.users
  WHERE replace(id::text, '-', '') LIKE (lower(p_ref_code) || '%')
  LIMIT 1;

  IF v_referrer_id IS NULL OR v_referrer_id = p_referred_id THEN
    RETURN false;
  END IF;

  INSERT INTO referrals (referrer_id, referred_id, ref_code)
  VALUES (v_referrer_id, p_referred_id, lower(p_ref_code))
  ON CONFLICT (referrer_id, referred_id) DO NOTHING;

  RETURN true;
END;
$$;

-- ── RPC: track_referral_puzzle ─────────────────────────────────────────────
-- Increments puzzle_count for a referred user.
-- When count reaches 5, activates the referral and rewards the referrer
-- with 7 extra days of premium. Returns true if just activated.
CREATE OR REPLACE FUNCTION track_referral_puzzle(p_referred_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count   int;
  v_referrer_id uuid;
BEGIN
  UPDATE referrals
  SET puzzle_count = puzzle_count + 1
  WHERE referred_id = p_referred_id AND NOT activated
  RETURNING puzzle_count, referrer_id INTO v_new_count, v_referrer_id;

  IF v_new_count IS NULL THEN
    RETURN false;
  END IF;

  IF v_new_count >= 5 THEN
    UPDATE referrals
    SET activated = true
    WHERE referred_id = p_referred_id AND NOT activated;

    UPDATE profiles
    SET premium_until =
      GREATEST(COALESCE(premium_until, now()), now()) + INTERVAL '7 days'
    WHERE id = v_referrer_id;

    RETURN true;
  END IF;

  RETURN false;
END;
$$;
