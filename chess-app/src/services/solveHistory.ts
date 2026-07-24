import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

const LOCAL_KEY  = 'chess_solve_history';
const LOCAL_MAX  = 100;

export interface SolveEvent {
  puzzleId: string;
  date: string;     // ISO timestamp
  solved: boolean;
  tactic: string;   // puzzle.themes[0]
  rating: number;   // puzzle rating
  eloAfter: number; // user ELO after this result
}

// ── Local (guest) ──────────────────────────────────────────────────────────────

async function readLocal(): Promise<SolveEvent[]> {
  const raw = await AsyncStorage.getItem(LOCAL_KEY);
  return raw ? (JSON.parse(raw) as SolveEvent[]) : [];
}

async function writeLocal(events: SolveEvent[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(events));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Persist a solve event. Fire-and-forget safe. */
export async function recordSolveEvent(
  userId: string,
  event: SolveEvent,
): Promise<void> {
  if (useAuthStore.getState().isGuest) {
    const all = await readLocal();
    all.unshift(event); // newest first
    if (all.length > LOCAL_MAX) all.length = LOCAL_MAX;
    await writeLocal(all);
    return;
  }

  const { error } = await supabase.from('puzzle_solve_events').insert({
    user_id:   userId,
    puzzle_id: event.puzzleId,
    solved:    event.solved,
    tactic:    event.tactic,
    rating:    event.rating,
    elo_after: event.eloAfter,
    created_at: event.date,
  });
  if (error) console.error('[solveHistory] insert error:', error.message);
}

/** Load solve history, newest first. */
export async function loadSolveHistory(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<SolveEvent[]> {
  if (useAuthStore.getState().isGuest) {
    const all = await readLocal();
    return all.slice(offset, offset + limit);
  }

  const { data, error } = await supabase
    .from('puzzle_solve_events')
    .select('puzzle_id, solved, tactic, rating, elo_after, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return [];

  return data.map((r) => ({
    puzzleId: r.puzzle_id as string,
    date:     r.created_at as string,
    solved:   r.solved as boolean,
    tactic:   r.tactic as string,
    rating:   r.rating as number,
    eloAfter: r.elo_after as number,
  }));
}

/** Remove all local history — called during guest→auth migration. */
export async function clearLocalHistory(): Promise<void> {
  await AsyncStorage.removeItem(LOCAL_KEY);
}
