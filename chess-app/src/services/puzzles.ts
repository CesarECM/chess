import { supabase } from './supabase';
import type { Puzzle, TacticType } from '@/types';

function rowToPuzzle(row: Record<string, unknown>): Puzzle {
  return {
    id:              row.id as string,
    fen:             row.fen as string,
    moves:           row.moves as string[],
    rating:          row.rating as number,
    ratingDeviation: row.rating_deviation as number,
    popularity:      row.popularity as number,
    themes:          (row.themes as string[]) as TacticType[],
    gameUrl:         (row.game_url as string) ?? undefined,
  };
}

export async function fetchPuzzleById(id: string): Promise<Puzzle | null> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return rowToPuzzle(data as Record<string, unknown>);
}

/** Returns the first puzzle ordered by ID — used as fallback until S5 feed logic. */
export async function fetchFirstPuzzle(): Promise<Puzzle | null> {
  const { data, error } = await supabase
    .from('puzzles')
    .select('*')
    .order('id')
    .limit(1);
  if (error || !data?.[0]) return null;
  return rowToPuzzle(data[0] as Record<string, unknown>);
}

/** Returns a random puzzle, excluding the given ID. Falls back to fetchFirstPuzzle on error. */
export async function fetchRandomPuzzle(excludeId?: string): Promise<Puzzle | null> {
  const offset = Math.floor(Math.random() * 499);
  let query = supabase.from('puzzles').select('*').order('id').range(offset, offset);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error || !data?.[0]) return fetchFirstPuzzle();
  return rowToPuzzle(data[0] as Record<string, unknown>);
}
