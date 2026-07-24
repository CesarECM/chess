import type { TacticType } from '@/types';

export interface UserStatsSnapshot {
  puzzlesCompleted: number;
  streakDays: number;
  elo: number;
  solvedByTheme: Partial<Record<TacticType, number>>;
  unlockedMedals: string[];
}

type MedalCriteria = (stats: UserStatsSnapshot) => boolean;

const CRITERIA: Record<string, MedalCriteria> = {
  first_solve:         (s) => s.puzzlesCompleted >= 1,
  ten_solves:          (s) => s.puzzlesCompleted >= 10,
  hundred_solves:      (s) => s.puzzlesCompleted >= 100,
  five_hundred_solves: (s) => s.puzzlesCompleted >= 500,

  streak_3:  (s) => s.streakDays >= 3,
  streak_7:  (s) => s.streakDays >= 7,
  streak_30: (s) => s.streakDays >= 30,

  rank_knight: (s) => s.elo >= 800,
  rank_bishop: (s) => s.elo >= 1200,
  rank_rook:   (s) => s.elo >= 1500,
  rank_queen:  (s) => s.elo >= 1800,
  rank_king:   (s) => s.elo >= 2200,

  ten_mates: (s) => (s.solvedByTheme.mate ?? 0) >= 10,
  ten_forks: (s) => (s.solvedByTheme.fork ?? 0) >= 10,
  ten_pins:  (s) => (s.solvedByTheme.pin  ?? 0) >= 10,
};

/**
 * Returns IDs of medals that should be unlocked given the current stats,
 * excluding any already in `unlockedMedals`.
 */
export function evaluateNewMedals(stats: UserStatsSnapshot): string[] {
  const already = new Set(stats.unlockedMedals);
  return Object.entries(CRITERIA)
    .filter(([id, check]) => !already.has(id) && check(stats))
    .map(([id]) => id);
}
