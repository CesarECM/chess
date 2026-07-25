import { supabase } from '@/services/supabase';
import { loadDueProgress } from '@/services/puzzleProgress';
import { fetchViralityScores } from '@/services/virality';
import { clamp } from '@/utils';
import type { Puzzle } from '@/types';

const ELO_WINDOW = 200;

// Feed scoring weights
const W_ELO_MATCH   = 0.40;
const W_VIRALITY    = 0.25;
const W_POPULARITY  = 0.20;
const W_RELIABILITY = 0.15;

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

function scoreCandidate(puzzle: Puzzle, userElo: number, virality: number): number {
  const eloMatch         = Math.max(0, 1 - Math.abs(puzzle.rating - userElo) / ELO_WINDOW);
  const popularityScore  = clamp((puzzle.popularity + 100) / 200, 0, 1);
  const reliabilityScore = clamp(1 - puzzle.ratingDeviation / 500, 0, 1);
  return (
    W_ELO_MATCH   * eloMatch +
    W_VIRALITY    * virality +
    W_POPULARITY  * popularityScore +
    W_RELIABILITY * reliabilityScore
  );
}

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

  for (const puzzle of overflow) {
    if (diverse.length >= limit) break;
    diverse.push(puzzle);
  }

  return diverse;
}

function shuffled<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

/**
 * Return the next puzzle for a single-puzzle flow (non-feed contexts).
 * Priority: most-overdue FSRS repaso → new puzzle calibrated to ELO.
 */
export async function fetchNextPuzzle(
  userId: string,
  userElo: number,
  excludeId?: string,
): Promise<Puzzle | null> {
  const due = await loadDueProgress(userId);
  const dueFiltered = due.filter((p) => p.puzzleId !== excludeId);

  if (dueFiltered.length > 0) {
    const puzzles = await fetchPuzzlesByIds([dueFiltered[0].puzzleId]);
    if (puzzles[0]) return puzzles[0];
  }

  // Fetch total count so the random offset is always valid
  const { count } = await supabase
    .from('puzzles')
    .select('id', { count: 'exact', head: true });
  const total = count ?? 0;
  if (total === 0) return null;

  const batch  = 30;
  const offset = Math.floor(Math.random() * Math.max(1, total - batch));

  const { data } = await supabase
    .from('puzzles')
    .select('*')
    .gte('rating', userElo - ELO_WINDOW)
    .lte('rating', userElo + ELO_WINDOW)
    .order('id')
    .range(offset, offset + batch - 1);

  if (!data) return null;

  // Exclude the given ID in JS to avoid SQL string-building issues
  const candidate = (data as Record<string, unknown>[])
    .map(rowToPuzzle)
    .find((p) => p.id !== excludeId);

  if (candidate) return candidate;

  // Fallback: first puzzle outside the exclusion
  const { data: fallback } = await supabase
    .from('puzzles')
    .select('*')
    .neq('id', excludeId ?? '')
    .order('id')
    .limit(1);

  return fallback?.[0] ? rowToPuzzle(fallback[0] as Record<string, unknown>) : null;
}

/**
 * Build a prioritized, scored, and diversified puzzle batch for the feed.
 *
 * Priority order:
 *  1. FSRS repasos vencidos (most overdue first).
 *  2. Puzzles WITH our engagement data (virality row with total_attempts ≥ 1),
 *     ranked by composite score + topic diversity.
 *  3. Puzzles WITHOUT engagement data yet (random fill) — these are "stock"
 *     puzzles that have not been seen by any user yet.
 */
export async function buildReviewQueue(
  userId: string,
  userElo: number,
  batchSize = 10,
  excludeIds: string[] = [],
): Promise<Puzzle[]> {
  // ── Tier 1: FSRS repasos vencidos ─────────────────────────────────────────
  const due      = await loadDueProgress(userId);
  const dueIds   = due.map((p) => p.puzzleId);
  const duePuzzles = await fetchPuzzlesByIds(dueIds);

  const remaining = batchSize - duePuzzles.length;
  if (remaining <= 0) return duePuzzles.slice(0, batchSize);

  // Build JS-side exclusion set — no SQL string building
  const excluded = new Set([...dueIds, ...excludeIds]);

  // ── Fetch candidate pool (ELO window, wider than needed for scoring) ───────
  const { data: rawCandidates } = await supabase
    .from('puzzles')
    .select('*')
    .gte('rating', userElo - ELO_WINDOW)
    .lte('rating', userElo + ELO_WINDOW)
    .order('id')
    .limit(remaining * 4);

  const candidates = ((rawCandidates ?? []) as Record<string, unknown>[])
    .map(rowToPuzzle)
    .filter((p) => !excluded.has(p.id));

  if (candidates.length === 0) return duePuzzles;

  // ── Fetch virality data for the candidate pool ─────────────────────────────
  const viralityMap = await fetchViralityScores(candidates.map((p) => p.id));

  // ── Tier 2: puzzles WITH engagement data ──────────────────────────────────
  // A puzzle has data ↔ it has a row in puzzle_virality (viralityMap.has its id).
  // Rows are only created by increment_virality, so presence = at least 1 attempt.
  const withData    = candidates.filter((p) =>  viralityMap.has(p.id));
  const withoutData = candidates.filter((p) => !viralityMap.has(p.id));

  const tier2Sorted = withData
    .map((p) => ({ puzzle: p, score: scoreCandidate(p, userElo, viralityMap.get(p.id)!) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.puzzle);

  const tier2 = applyTopicDiversity(tier2Sorted, 2, remaining);

  // ── Tier 3: puzzles WITHOUT engagement data (random fill) ─────────────────
  const need3 = remaining - tier2.length;
  const tier3  = need3 > 0 ? shuffled(withoutData).slice(0, need3) : [];

  return [...duePuzzles, ...tier2, ...tier3];
}
