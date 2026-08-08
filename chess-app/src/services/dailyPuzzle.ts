import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import type { Puzzle } from '@/types';

const DAILY_PREFIX = 'daily_puzzle_';

export interface DailyPuzzleResult {
  puzzleId:          string;
  date:              string;
  solved:            boolean;
  firstAttemptClean: boolean;
  attempts:          number;
  theme:             string;
}

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

// FNV-1a 32-bit — stable, deterministic hash for date strings
function dateSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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
    isDailyPuzzle:   true,
  };
}

export async function loadDailyResult(): Promise<DailyPuzzleResult | null> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_PREFIX + getTodayDateStr());
    return raw ? (JSON.parse(raw) as DailyPuzzleResult) : null;
  } catch {
    return null;
  }
}

export async function saveDailyResult(result: DailyPuzzleResult): Promise<void> {
  try {
    await AsyncStorage.setItem(DAILY_PREFIX + result.date, JSON.stringify(result));
  } catch {}
}

/**
 * Returns today's daily puzzle if not yet played, null otherwise.
 * Selects the same puzzle for all users via date-seeded offset over a
 * stable quality pool (popularity ≥ 80, rating_deviation ≤ 80, ordered by id).
 */
export async function getDailyPuzzleForFeed(): Promise<Puzzle | null> {
  const existing = await loadDailyResult();
  if (existing) return null;

  const today = getTodayDateStr();
  const seed  = dateSeed(today);

  const { count } = await supabase
    .from('puzzles')
    .select('id', { count: 'exact', head: true })
    .gte('popularity', 80)
    .lte('rating_deviation', 80);

  const total = count ?? 0;
  if (total === 0) return null;

  const offset = seed % total;

  const { data } = await supabase
    .from('puzzles')
    .select('*')
    .gte('popularity', 80)
    .lte('rating_deviation', 80)
    .order('id')
    .range(offset, offset);

  if (!data?.[0]) return null;
  return rowToPuzzle(data[0] as Record<string, unknown>);
}
