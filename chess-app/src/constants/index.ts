export const ELO_RANGES = {
  PAWN:   { min: 0,        max: 800,      label: 'pawn',   piece: '♟' },
  KNIGHT: { min: 800,      max: 1200,     label: 'knight', piece: '♞' },
  BISHOP: { min: 1200,     max: 1500,     label: 'bishop', piece: '♝' },
  ROOK:   { min: 1500,     max: 1800,     label: 'rook',   piece: '♜' },
  QUEEN:  { min: 1800,     max: 2200,     label: 'queen',  piece: '♛' },
  KING:   { min: 2200,     max: Infinity, label: 'king',   piece: '♚' },
} as const;

// ── preElo calibration ──────────────────────────────────────────────────────
export const PRE_ELO_LOWER              = 400;
export const PRE_ELO_UPPER              = 3300;
export const PRE_ELO_ONBOARDING_WINDOW  = 500;  // ± around declared level to seed initial bounds
export const PRE_ELO_CONVERGENCE        = 100;  // range < this → calibrated
export const PRE_ELO_NUMERIC_THRESHOLD  = 300;  // range ≤ this → show numbers

// ── calibration quality filters ──────────────────────────────────────────────
export const CALIB_MIN_POPULARITY   = 50;
export const CALIB_MAX_RATING_DEV   = 100;

// ── calibration time signal ───────────────────────────────────────────────────
export const CALIB_FAST_SOLVE_MS    = 10_000;  // < 10s solve → clearly below their level
export const CALIB_FAST_SOLVE_BONUS = 100;     // push lower bound up by this many ELO points
export const CALIB_MISCLICK_MS      = 4_000;   // < 4s fail → likely misclick
export const CALIB_MISCLICK_CREDIT  = 50;      // soften upper bound drop
export const CALIB_SLOW_FAIL_MS     = 60_000;  // > 60s fail → engaged seriously, partial credit
export const CALIB_SLOW_FAIL_CREDIT = 50;

// ── recalibration ────────────────────────────────────────────────────────────
export const RECALIBRATION_DAYS          = 30;
export const DRIFT_SAMPLE_SIZE           = 20;
export const DRIFT_THRESHOLD             = 0.30;
export const RECALIB_COOLDOWN_PUZZLES    = 50;   // puzzles after calibration before drift can trigger
export const RECALIB_CONSECUTIVE_RECORDS = 5;    // consecutive personal bests → recalibrate upward
export const RECALIB_STREAK_WINDOW_UP    = 300;  // search window above current ELO for streak trigger

export const FSRS_TARGET_RETENTION = 0.9;

// Implicit FSRS rating thresholds (milliseconds) — legacy, used by deriveFsrsRating
export const FSRS_EASY_THRESHOLD_MS = 15_000;   // 15 s
export const FSRS_HARD_THRESHOLD_MS = 60_000;   // 60 s

// ── 5-State resolution system ────────────────────────────────────────────────
export const FSRS_STATE_1_FAST  = 4 as const;  // primera, sin pista, ≤60s → Easy
export const FSRS_STATE_1_SLOW  = 3 as const;  // primera, sin pista, >60s → Good
export const FSRS_STATE_2       = 3 as const;  // primera, con pista       → Good
export const FSRS_STATE_3       = 2 as const;  // segunda, sin pista       → Hard
export const FSRS_STATE_4       = 2 as const;  // segunda, con pista       → Hard
export const FSRS_STATE_5       = 1 as const;  // no resuelto              → Again
export const TIME_FAST_THRESHOLD_MS  = 60_000; // ≤60s = estado 1 (rápido)

// ── Crown system ─────────────────────────────────────────────────────────────
export const CROWN_GOLD_PROBABILITY = 0.12; // en estado 1/1b: 12% Oro, resto Plata

// ── Session ──────────────────────────────────────────────────────────────────
export const SESSION_MANUAL_MIN_CORRECT = 10; // puzzles resueltos sin pista (estados 1/1b/3) para habilitar gate de sesión

export const SUBSCRIPTION_PRICE_USD = 2.99;

export const REFERRAL_MIN_PUZZLES = 10;

export const AD_FREQUENCY = 5; // mostrar ad cada N puzzles

export const PROGRESS_CARDS_ENABLED = true;

export const MILESTONE_THRESHOLDS = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

export const RANK_THRESHOLDS = [
  { elo: 800,  rankKey: 'knight', piece: '♞' },
  { elo: 1200, rankKey: 'bishop', piece: '♝' },
  { elo: 1500, rankKey: 'rook',   piece: '♜' },
  { elo: 1800, rankKey: 'queen',  piece: '♛' },
  { elo: 2200, rankKey: 'king',   piece: '♚' },
] as const;
