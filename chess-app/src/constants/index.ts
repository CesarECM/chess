export const ELO_RANGES = {
  PAWN:   { min: 0,        max: 800,      label: 'pawn',   piece: '♟' },
  KNIGHT: { min: 800,      max: 1200,     label: 'knight', piece: '♞' },
  BISHOP: { min: 1200,     max: 1500,     label: 'bishop', piece: '♝' },
  ROOK:   { min: 1500,     max: 1800,     label: 'rook',   piece: '♜' },
  QUEEN:  { min: 1800,     max: 2200,     label: 'queen',  piece: '♛' },
  KING:   { min: 2200,     max: Infinity, label: 'king',   piece: '♚' },
} as const;

export const CALIBRATION_PUZZLES = 12;

export const FSRS_TARGET_RETENTION = 0.9;

// Implicit FSRS rating thresholds (milliseconds)
// solved < EASY  → Easy(4)
// solved < HARD  → Good(3)
// solved ≥ HARD  → Hard(2)
// failed         → Again(1)
export const FSRS_EASY_THRESHOLD_MS = 15_000;   // 15 s
export const FSRS_HARD_THRESHOLD_MS = 60_000;   // 60 s

export const SUBSCRIPTION_PRICE_USD = 2.99;

export const REFERRAL_MIN_PUZZLES = 10;

export const AD_FREQUENCY = 5; // mostrar ad cada N puzzles
