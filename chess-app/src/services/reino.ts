import { supabase } from './supabase';
import type { CrownType } from './fsrs';
import type { UserPuzzleProgress } from '@/types';
import type { HallId } from '@/constants/reino';
import { computeSpeedPoints } from '@/constants/reino';

// True when a previously-failed puzzle first crosses the 21-day stability threshold
export function detectCrystalEarned(
  before: UserPuzzleProgress | null,
  after: UserPuzzleProgress,
): boolean {
  if (!before) return false;
  return after.lapses > 0 && before.stability < 21 && after.stability >= 21;
}

export async function recordCrown(
  userId: string,
  puzzleId: string,
  crownType: CrownType,
): Promise<void> {
  if (!crownType || !userId) return;
  await supabase.from('crowns_log').insert({
    user_id:    userId,
    puzzle_id:  puzzleId,
    crown_type: crownType,
  });
}

export async function recordCrystal(
  userId: string,
  puzzleId: string,
): Promise<void> {
  if (!userId) return;
  await supabase.from('crystal_log').insert({
    user_id:  userId,
    puzzle_id: puzzleId,
  });
}

export async function upsertHallProgress(
  userId: string,
  hallId: HallId,
  level: number,
  puzzlesCount: number,
): Promise<void> {
  if (!userId) return;
  await supabase.from('hall_progress').upsert({
    user_id:       userId,
    hall_id:       hallId,
    level,
    puzzles_count: puzzlesCount,
    updated_at:    new Date().toISOString(),
  });
}

export async function recordSolveTime(
  userId: string,
  puzzleId: string,
  timeMs: number,
): Promise<void> {
  if (!userId || timeMs <= 0) return;
  await supabase.from('puzzle_solve_times').insert({
    user_id:  userId,
    puzzle_id: puzzleId,
    time_ms:  timeMs,
  });
}

// Returns a speed percentile bucket (0 | 50 | 60 | 70) based on aggregate stats.
// Returns 0 if stats are insufficient (<10 samples).
export async function getSpeedPercentile(
  puzzleId: string,
  timeMs: number,
): Promise<number> {
  const { data } = await supabase
    .from('puzzle_speed_stats')
    .select('p50_ms, p60_ms, p70_ms, sample_count')
    .eq('puzzle_id', puzzleId)
    .maybeSingle();

  if (!data || (data.sample_count as number) < 10) return 0;

  if (timeMs <= (data.p70_ms as number)) return 75;
  if (timeMs <= (data.p60_ms as number)) return 65;
  if (timeMs <= (data.p50_ms as number)) return 55;
  return 25;
}

export async function getAndApplySpeedPoints(
  userId: string,
  puzzleId: string,
  timeMs: number,
  onPoints: (points: 0 | 1 | 2 | 3, percentile: number) => void,
): Promise<void> {
  if (!userId || timeMs <= 0) return;
  const percentile = await getSpeedPercentile(puzzleId, timeMs);
  const points     = computeSpeedPoints(percentile);
  onPoints(points, percentile);
}

export async function upsertLivesState(
  userId: string,
  current: number,
  max: number,
  lastRechargeAt: string,
  speedBonusToday: number,
): Promise<void> {
  if (!userId) return;
  await supabase.from('lives_state').upsert({
    user_id:           userId,
    current_lives:     current,
    max_lives:         max,
    last_recharge_at:  lastRechargeAt,
    speed_bonus_today: speedBonusToday,
  });
}
