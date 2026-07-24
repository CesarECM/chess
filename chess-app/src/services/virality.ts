import { supabase } from '@/services/supabase';
import { clamp } from '@/utils';

// solve-time sweet spot for the speed score (20 s = ideal engagement)
const IDEAL_SOLVE_MS = 20_000;

interface ViralityRow {
  puzzle_id:      string;
  total_attempts: number;
  total_failures: number;
  total_solves:   number;
  total_solve_ms: number;
}

/**
 * Composite virality score ∈ [0, 1] for a puzzle given its aggregate stats.
 *
 * fail_score    — sweet spot 30-70 % failure rate (peak engagement difficulty)
 * speed_score   — log-scale proximity to IDEAL_SOLVE_MS (too fast/slow scores lower)
 * completion    — fraction of attempts that end in a solve (not abandoned on fail)
 */
export function computeViralityScore(row: ViralityRow): number {
  if (row.total_attempts === 0) return 0.5; // neutral fallback for unseen puzzles

  const failRate       = row.total_failures / row.total_attempts;
  const completionRate = row.total_solves   / row.total_attempts;

  // Fail score: peaks at 50 % failure, falls off symmetrically
  const failScore = clamp(1 - Math.abs(failRate - 0.5) * 2, 0, 1);

  // Speed score: log-scale bell around IDEAL_SOLVE_MS; 0 if no solves yet
  const avgSolveMs  = row.total_solves > 0 ? row.total_solve_ms / row.total_solves : 0;
  const speedScore  = avgSolveMs > 0
    ? clamp(1 - Math.abs(Math.log(avgSolveMs / IDEAL_SOLVE_MS)) / 2, 0, 1)
    : 0.5;

  return 0.40 * failScore + 0.30 * speedScore + 0.30 * completionRate;
}

/**
 * Fire-and-forget: record one puzzle result in the virality aggregate.
 * Uses a Postgres RPC for an atomic increment (no read-then-write race).
 * Requires migrate-virality.sql to have been run in Supabase.
 */
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

/**
 * Fetch virality scores for a batch of puzzle IDs.
 * Returns a Map<puzzleId, score>. Missing IDs default to 0.5 (neutral).
 */
export async function fetchViralityScores(
  puzzleIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (puzzleIds.length === 0) return result;

  const { data, error } = await supabase
    .from('puzzle_virality')
    .select('puzzle_id, total_attempts, total_failures, total_solves, total_solve_ms')
    .in('puzzle_id', puzzleIds);

  if (error || !data) return result;

  for (const row of data as ViralityRow[]) {
    result.set(row.puzzle_id, computeViralityScore(row));
  }
  return result;
}
