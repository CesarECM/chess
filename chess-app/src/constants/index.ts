export const ELO_RANGES = {
  PAWN: { min: 0, max: 800, label: 'Peón', piece: '♟' },
  KNIGHT: { min: 800, max: 1200, label: 'Caballo', piece: '♞' },
  BISHOP: { min: 1200, max: 1500, label: 'Alfil', piece: '♝' },
  ROOK: { min: 1500, max: 1800, label: 'Torre', piece: '♜' },
  QUEEN: { min: 1800, max: 2200, label: 'Reina', piece: '♛' },
  KING: { min: 2200, max: Infinity, label: 'Rey', piece: '♚' },
} as const;

export const CALIBRATION_PUZZLES = 12;

export const FSRS_TARGET_RETENTION = 0.9;

export const SUBSCRIPTION_PRICE_USD = 2.99;

export const REFERRAL_MIN_PUZZLES = 10;

export const AD_FREQUENCY = 5; // mostrar ad cada N puzzles
