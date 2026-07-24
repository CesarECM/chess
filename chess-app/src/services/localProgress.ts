import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserPuzzleProgress } from '@/types';

const KEY = 'chess_local_progress';

async function readAll(): Promise<Record<string, UserPuzzleProgress>> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Record<string, UserPuzzleProgress>) : {};
}

async function writeAll(data: Record<string, UserPuzzleProgress>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(data));
}

export async function loadLocalProgress(
  puzzleId: string,
): Promise<UserPuzzleProgress | null> {
  const all = await readAll();
  return all[puzzleId] ?? null;
}

export async function saveLocalProgress(progress: UserPuzzleProgress): Promise<void> {
  const all = await readAll();
  all[progress.puzzleId] = progress;
  await writeAll(all);
}

export async function loadDueLocalProgress(
  now: Date = new Date(),
): Promise<UserPuzzleProgress[]> {
  const all = await readAll();
  const nowIso = now.toISOString();
  return Object.values(all)
    .filter((p) => p.nextReviewAt <= nowIso)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
}

/** Returns all local progress records — used by S6.3 migration. */
export async function loadAllLocalProgress(): Promise<UserPuzzleProgress[]> {
  const all = await readAll();
  return Object.values(all);
}

/** Removes all local progress — called after S6.3 migration to Supabase. */
export async function clearLocalProgress(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
