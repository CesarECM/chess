import { clamp } from '@/utils';

export interface EloResult {
  newElo: number;
  delta: number;
}

/**
 * Standard Glicko-style ELO for puzzles.
 * K=32 during calibration, K=16 after — caller supplies kFactor.
 */
export function calculateElo(
  playerElo: number,
  puzzleRating: number,
  solved: boolean,
  kFactor: number,
): EloResult {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerElo) / 400));
  const actual = solved ? 1 : 0;
  const delta = Math.round(kFactor * (actual - expected));
  const newElo = clamp(playerElo + delta, 100, 3000);
  return { newElo, delta };
}
