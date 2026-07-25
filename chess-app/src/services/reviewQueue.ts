import { supabase } from '@/services/supabase';
import { loadDueProgress } from '@/services/puzzleProgress';
import {
  fetchViralityScores,
  FRESH_THRESHOLD,
  GOOD_SCORE,
  MEDIOCRE_SCORE,
  RETIRE_PERSISTENT_ATTEMPTS,
} from '@/services/virality';
import { clamp } from '@/utils';
import type { Puzzle } from '@/types';

const ELO_WINDOW = 200;

// Feed scoring weights
const W_ELO_MATCH   = 0.40;
const W_VIRALITY    = 0.25;
const W_POPULARITY  = 0.20;
const W_RELIABILITY = 0.15;

// Lifecycle budget fractions (must sum to 1.0)
const BUDGET_FRESH    = 0.25;
const BUDGET_RISING   = 0.45;
const BUDGET_COASTING = 0.20;
const BUDGET_STRUGGLE = 0.10;

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

function scoreCandidate(puzzle: Puzzle, userElo: number, effectiveScore: number): number {
  const eloMatch         = Math.max(0, 1 - Math.abs(puzzle.rating - userElo) / ELO_WINDOW);
  const popularityScore  = clamp((puzzle.popularity + 100) / 200, 0, 1);
  const reliabilityScore = clamp(1 - puzzle.ratingDeviation / 500, 0, 1);
  return (
    W_ELO_MATCH   * eloMatch +
    W_VIRALITY    * effectiveScore +
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

  const candidate = (data as Record<string, unknown>[])
    .map(rowToPuzzle)
    .find((p) => p.id !== excludeId);

  if (candidate) return candidate;

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
 * Lifecycle phases (TikTok-style content amplification):
 *  1. FSRS repasos vencidos — always first.
 *  2. Fresh    (25 %) — no data or < FRESH_THRESHOLD attempts. New content.
 *  3. Rising   (45 %) — effectiveScore ≥ GOOD_SCORE. Proven high performers.
 *  4. Coasting (20 %) — MEDIOCRE_SCORE ≤ effectiveScore < GOOD_SCORE. Middle tier.
 *  5. Struggling(10%) — low score, probabilistic inclusion that decays with attempts.
 *     Retired puzzles (score confirmed bad after enough attempts) are never shown.
 */
export async function buildReviewQueue(
  userId: string,
  userElo: number,
  batchSize = 10,
  excludeIds: string[] = [],
): Promise<Puzzle[]> {
  // ── Tier 1: FSRS repasos vencidos ─────────────────────────────────────────
  const due        = await loadDueProgress(userId);
  const dueIds     = due.map((p) => p.puzzleId);
  const duePuzzles = await fetchPuzzlesByIds(dueIds);

  const remaining = batchSize - duePuzzles.length;
  if (remaining <= 0) return duePuzzles.slice(0, batchSize);

  const excluded = new Set([...dueIds, ...excludeIds]);

  // ── Fetch candidate pool ──────────────────────────────────────────────────
  const { data: rawCandidates } = await supabase
    .from('puzzles')
    .select('*')
    .gte('rating', userElo - ELO_WINDOW)
    .lte('rating', userElo + ELO_WINDOW)
    .order('id')
    .limit(remaining * 5);

  const candidates = ((rawCandidates ?? []) as Record<string, unknown>[])
    .map(rowToPuzzle)
    .filter((p) => !excluded.has(p.id));

  if (candidates.length === 0) return duePuzzles;

  // ── Fetch virality data (score, effectiveScore, attempts, retired) ─────────
  const viralityMap = await fetchViralityScores(candidates.map((p) => p.id));

  // ── Classify candidates into lifecycle phases ─────────────────────────────
  const fresh:     Puzzle[]                              = [];
  const rising:    Puzzle[]                              = [];
  const coasting:  Puzzle[]                              = [];
  const struggling: { puzzle: Puzzle; attempts: number }[] = [];

  for (const p of candidates) {
    const data = viralityMap.get(p.id);
    if (!data || data.attempts < FRESH_THRESHOLD) { fresh.push(p);    continue; }
    if (data.retired)                              {                    continue; }
    if (data.effectiveScore >= GOOD_SCORE)         { rising.push(p);   continue; }
    if (data.effectiveScore >= MEDIOCRE_SCORE)     { coasting.push(p); continue; }
    struggling.push({ puzzle: p, attempts: data.attempts });
  }

  // ── Budget targets ────────────────────────────────────────────────────────
  const tFresh    = Math.round(remaining * BUDGET_FRESH);
  const tRising   = Math.round(remaining * BUDGET_RISING);
  const tCoasting = Math.round(remaining * BUDGET_COASTING);
  const tStruggle = Math.max(1, Math.round(remaining * BUDGET_STRUGGLE));

  // ── Pick from each phase ──────────────────────────────────────────────────
  const freshPicks = shuffled(fresh).slice(0, tFresh);

  const risingByScore = rising
    .map((p) => ({ puzzle: p, score: scoreCandidate(p, userElo, viralityMap.get(p.id)!.effectiveScore) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.puzzle);
  const risingPicks = applyTopicDiversity(risingByScore, 2, tRising);

  const coastingByScore = coasting
    .map((p) => ({ puzzle: p, score: scoreCandidate(p, userElo, viralityMap.get(p.id)!.effectiveScore) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.puzzle);
  const coastingPicks = applyTopicDiversity(coastingByScore, 2, tCoasting);

  // Struggling: inclusion probability decays linearly with attempts → 0 at RETIRE_PERSISTENT_ATTEMPTS
  const eligibleStruggling = struggling
    .filter(({ attempts }) => Math.random() < Math.max(0, 1 - attempts / RETIRE_PERSISTENT_ATTEMPTS))
    .map(({ puzzle }) => puzzle);
  const strugglePicks = shuffled(eligibleStruggling).slice(0, tStruggle);

  // ── Assemble + fill any gaps left by short pools ──────────────────────────
  const picked = [...freshPicks, ...risingPicks, ...coastingPicks, ...strugglePicks];
  const pickedIds = new Set([...excluded, ...picked.map((p) => p.id)]);
  const needed = remaining - picked.length;
  if (needed > 0) {
    const leftovers = candidates
      .filter((p) => !pickedIds.has(p.id))
      .slice(0, needed);
    picked.push(...leftovers);
  }

  return [...duePuzzles, ...picked];
}
