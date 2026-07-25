import { supabase } from '@/services/supabase';
import { clamp } from '@/utils';

const IDEAL_SOLVE_MS = 20_000;
const CONFIDENCE_K   = 40;

// Lifecycle thresholds — consumed by reviewQueue
export const FRESH_THRESHOLD            = 30;
export const GOOD_SCORE                 = 0.55;
export const MEDIOCRE_SCORE             = 0.35;
export const RETIRE_BAD_ATTEMPTS        = 100;
export const RETIRE_BAD_SCORE           = 0.20;
export const RETIRE_PERSISTENT_ATTEMPTS = 250;
export const ANCHOR_SLOTS               = 2;

interface ViralityRow {
  puzzle_id:      string;
  total_attempts: number;
  total_failures: number;
  total_solves:   number;
  total_solve_ms: number;
  total_skips:    number;
}

export interface ViralityData {
  score:          number;   // raw composite virality score ∈ [0, 1]
  effectiveScore: number;   // Bayesian-smoothed score (confidence-weighted toward 0.5 prior)
  attempts:       number;
  skips:          number;
  impressions:    number;   // attempts + skips — used for confidence and lifecycle classification
  retired:        boolean;
}

export function computeViralityScore(row: ViralityRow): number {
  const impressions = row.total_attempts + row.total_skips;
  if (impressions === 0) return 0.5;

  const skipRate    = row.total_skips / impressions;
  const skipPenalty = clamp(1 - skipRate * 2, 0, 1);

  // All impressions were skips — no attempt data, apply penalty to neutral baseline
  if (row.total_attempts === 0) return 0.5 * skipPenalty;

  const failRate       = row.total_failures / row.total_attempts;
  const completionRate = row.total_solves   / row.total_attempts;
  const failScore      = clamp(1 - Math.abs(failRate - 0.5) * 2, 0, 1);

  const avgSolveMs = row.total_solves > 0 ? row.total_solve_ms / row.total_solves : 0;
  const speedScore = avgSolveMs > 0
    ? clamp(1 - Math.abs(Math.log(avgSolveMs / IDEAL_SOLVE_MS)) / 2, 0, 1)
    : 0.5;

  const baseScore = 0.40 * failScore + 0.30 * speedScore + 0.30 * completionRate;
  return baseScore * skipPenalty;
}

function computeEffectiveScore(measuredScore: number, impressions: number): number {
  const confidence = impressions / (impressions + CONFIDENCE_K);
  return 0.5 * (1 - confidence) + measuredScore * confidence;
}

function isRetired(effectiveScore: number, impressions: number): boolean {
  return (
    (impressions >= RETIRE_BAD_ATTEMPTS        && effectiveScore < RETIRE_BAD_SCORE) ||
    (impressions >= RETIRE_PERSISTENT_ATTEMPTS && effectiveScore < MEDIOCRE_SCORE)
  );
}

export async function recordViralityEvent(
  puzzleId: string,
  solved: boolean,
  elapsedMs: number,
): Promise<void> {
  const { error } = await supabase.rpc('increment_virality', {
    p_puzzle_id: puzzleId,
    p_solved:    solved,
    p_solve_ms:  solved ? Math.round(elapsedMs) : 0,
  });
  if (error) console.error('[virality] recordViralityEvent:', error.message);
}

export async function recordSkipEvent(puzzleId: string): Promise<void> {
  const { error } = await supabase.rpc('record_skip', { p_puzzle_id: puzzleId });
  if (error) console.error('[virality] recordSkipEvent:', error.message);
}

export async function fetchViralityScores(
  puzzleIds: string[],
): Promise<Map<string, ViralityData>> {
  const result = new Map<string, ViralityData>();
  if (puzzleIds.length === 0) return result;

  const { data, error } = await supabase
    .from('puzzle_virality')
    .select('puzzle_id, total_attempts, total_failures, total_solves, total_solve_ms, total_skips')
    .in('puzzle_id', puzzleIds);

  if (error || !data) return result;

  for (const row of data as ViralityRow[]) {
    const impressions    = row.total_attempts + row.total_skips;
    const score          = computeViralityScore(row);
    const effectiveScore = computeEffectiveScore(score, impressions);
    result.set(row.puzzle_id, {
      score,
      effectiveScore,
      attempts:    row.total_attempts,
      skips:       row.total_skips,
      impressions,
      retired: isRetired(effectiveScore, impressions),
    });
  }
  return result;
}
