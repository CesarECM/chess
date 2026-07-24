import { supabase } from '@/services/supabase';
import { loadDueProgress } from '@/services/puzzleProgress';
import { fetchViralityScores } from '@/services/virality';
import { clamp } from '@/utils';
import type { Puzzle } from '@/types';

const ELO_WINDOW = 200;

// Feed scoring weights (S5.4: virality replaces some proxy weight from S5.2)
const W_ELO_MATCH   = 0.40; // proximity to user's rating
const W_VIRALITY    = 0.25; // real engagement metrics (fail rate, speed, completion)
const W_POPULARITY  = 0.20; // Lichess popularity (-100..100 → 0..1) — fallback proxy
const W_RELIABILITY = 0.15; // low rating_deviation = well-calibrated puzzle

function rowToPuzzle(row: Record<string, unknown>): Puzzle {
  return {
    id:              row.id as string,
    fen:             row.fen as string,
    moves:           row.moves as string[],
    rating:          row.rating as number,
    ratingDeviation: row.rating_deviation as number,
    popularity:      row.popularity as number,
    themes:          row.themes as Puzzle['themes'],
    gameUrl:         (row.game_url as string) ?? undefined,
  };
}

/**
 * Composite feed score for a puzzle given the user's current ELO.
 * Higher = better match for this user's feed right now.
 * @param virality Pre-fetched virality score ∈ [0,1], or undefined → neutral 0.5
 */
function scoreCandidate(puzzle: Puzzle, userElo: number, virality?: number): number {
  const eloMatch         = Math.max(0, 1 - Math.abs(puzzle.rating - userElo) / ELO_WINDOW);
  const popularityScore  = clamp((puzzle.popularity + 100) / 200, 0, 1);
  const reliabilityScore = clamp(1 - puzzle.ratingDeviation / 500, 0, 1);
  const viralityScore    = virality ?? 0.5; // neutral for puzzles without data yet
  return (
    W_ELO_MATCH   * eloMatch +
    W_VIRALITY    * viralityScore +
    W_POPULARITY  * popularityScore +
    W_RELIABILITY * reliabilityScore
  );
}

/**
 * Greedy topic diversification: limit puzzles with the same primary theme
 * to `maxPerTheme` within the batch. If diversity reduces supply below
 * `limit`, overflow puzzles fill the gap regardless of theme.
 */
function applyTopicDiversity(puzzles: Puzzle[], maxPerTheme: number, limit: number): Puzzle[] {
  const themeCounts = new Map<string, number>();
  const diverse: Puzzle[] = [];
  const overflow: Puzzle[] = [];

  for (const puzzle of puzzles) {
    const theme = puzzle.themes[0] ?? 'other';
    const count = themeCounts.get(theme) ?? 0;
    if (count < maxPerTheme) {
      diverse.push(puzzle);
      themeCounts.set(theme, count + 1);
    } else {
      overflow.push(puzzle);
    }
    if (diverse.length >= limit) break;
  }

  // Fill any gap left by diversity constraints
  for (const puzzle of overflow) {
    if (diverse.length >= limit) break;
    diverse.push(puzzle);
  }

  return diverse;
}

/** Fetch multiple puzzles by their IDs in one query, preserving `ids` order. */
async function fetchPuzzlesByIds(ids: string[]): Promise<Puzzle[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .in('id', ids);
  if (error || !data) return [];
  const byId = new Map((data as Record<string, unknown>[]).map((r) => [r.id as string, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [rowToPuzzle(row)] : [];
  });
}

/** Fetch a random unseen puzzle within ELO_WINDOW of the user's current rating. */
async function fetchNewPuzzle(
  userId: string,
  userElo: number,
  excludeId?: string,
): Promise<Puzzle | null> {
  const { data: seen } = await supabase
    .from('user_puzzle_progress')
    .select('puzzle_id')
    .eq('user_id', userId);
  const seenIds = new Set((seen ?? []).map((r: { puzzle_id: string }) => r.puzzle_id));
  if (excludeId) seenIds.add(excludeId);

  const total  = 500;
  const batch  = 30;
  const offset = Math.floor(Math.random() * Math.max(1, total - batch));

  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .gte('rating', userElo - ELO_WINDOW)
    .lte('rating', userElo + ELO_WINDOW)
    .order('id')
    .range(offset, offset + batch - 1);

  if (error || !data) return null;

  const unseen = (data as Record<string, unknown>[]).find(
    (row) => !seenIds.has(row.id as string),
  );

  if (!unseen) {
    const { data: fallback } = await supabase
      .from('puzzles')
      .select('*')
      .not('id', 'in', `(${[...seenIds].join(',') || "''"})`)
      .order('id')
      .limit(1);
    return fallback?.[0] ? rowToPuzzle(fallback[0] as Record<string, unknown>) : null;
  }
  return rowToPuzzle(unseen);
}

/**
 * Return the next puzzle for the user:
 * 1. Most-overdue FSRS repaso (if any are due)
 * 2. New puzzle calibrated to user ELO
 */
export async function fetchNextPuzzle(
  userId: string,
  userElo: number,
  excludeId?: string,
): Promise<Puzzle | null> {
  const due = await loadDueProgress(userId);
  const dueFiltered = due.filter((p) => p.puzzleId !== excludeId);

  if (dueFiltered.length > 0) {
    const puzzle = await fetchPuzzlesByIds([dueFiltered[0].puzzleId]);
    if (puzzle[0]) return puzzle[0];
  }

  return fetchNewPuzzle(userId, userElo, excludeId);
}

/**
 * Build a prioritized, scored, and diversified puzzle batch for the feed.
 *
 * Order of priority:
 *  1. FSRS repasos vencidos (most overdue first).
 *  2. New puzzles ranked by composite score (ELO match + popularity + reliability),
 *     with topic diversity applied (max 2 per primary theme per batch).
 *
 * @param userId     Guest or authenticated user ID.
 * @param userElo    Current ELO used for candidate matching and scoring.
 * @param batchSize  Target number of puzzles to return.
 * @param excludeIds Additional IDs to skip (e.g. current session history).
 */
export async function buildReviewQueue(
  userId: string,
  userElo: number,
  batchSize = 10,
  excludeIds: string[] = [],
): Promise<Puzzle[]> {
  const due = await loadDueProgress(userId);

  const dueIds     = due.map((p) => p.puzzleId);
  const duePuzzles = await fetchPuzzlesByIds(dueIds);

  const remaining = batchSize - duePuzzles.length;
  if (remaining <= 0) return duePuzzles.slice(0, batchSize);

  // Merge all exclusions: FSRS due (already shown as review) + session history
  const allExcluded = [...new Set([...dueIds, ...excludeIds])];
  const excludeClause = allExcluded.join(',') || "''";

  // Fetch a wider pool than needed for better scoring/diversity selection
  const { data } = await supabase
    .from('puzzles')
    .select('*')
    .gte('rating', userElo - ELO_WINDOW)
    .lte('rating', userElo + ELO_WINDOW)
    .not('id', 'in', `(${excludeClause})`)
    .order('id')
    .limit(remaining * 3);

  const candidates = ((data ?? []) as Record<string, unknown>[]).map(rowToPuzzle);

  // Fetch virality scores for all candidates in one query
  const viralityMap = await fetchViralityScores(candidates.map((p) => p.id));

  // Score descending, then apply greedy topic diversity
  const sorted = candidates
    .map((p) => ({ puzzle: p, score: scoreCandidate(p, userElo, viralityMap.get(p.id)) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.puzzle);

  const newPuzzles = applyTopicDiversity(sorted, 2, remaining);

  return [...duePuzzles, ...newPuzzles];
}
