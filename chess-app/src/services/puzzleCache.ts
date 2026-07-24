import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Puzzle } from '@/types';

const KEY      = 'chess_puzzle_cache';
const MAX_SIZE = 50;

async function readCache(): Promise<Puzzle[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Puzzle[]) : [];
}

/**
 * Merges `puzzles` into the local cache, deduplicating by ID.
 * Keeps the most recent MAX_SIZE entries (newest at the front).
 */
export async function cachePuzzles(puzzles: Puzzle[]): Promise<void> {
  try {
    const existing = await readCache();
    const existingIds = new Set(existing.map((p) => p.id));
    const fresh = puzzles.filter((p) => !existingIds.has(p.id));
    const merged = [...fresh, ...existing].slice(0, MAX_SIZE);
    await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Cache write failure is non-critical — ignore silently
  }
}

/** Returns all cached puzzles, or [] if the cache is empty or unreadable. */
export async function getCachedPuzzles(): Promise<Puzzle[]> {
  try {
    return await readCache();
  } catch {
    return [];
  }
}

/** Returns a specific puzzle from cache, or null if not found. */
export async function getCachedPuzzleById(id: string): Promise<Puzzle | null> {
  try {
    const all = await readCache();
    return all.find((p) => p.id === id) ?? null;
  } catch {
    return null;
  }
}
