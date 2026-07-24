import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { UserPuzzleProgress } from '@/types';

const KEY = 'chess_sync_queue';

async function readQueue(): Promise<UserPuzzleProgress[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as UserPuzzleProgress[]) : [];
}

async function writeQueue(items: UserPuzzleProgress[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

/** Adds a failed FSRS save to the pending sync queue. */
export async function queueForSync(progress: UserPuzzleProgress): Promise<void> {
  try {
    const queue = await readQueue();
    // Replace any existing record for the same (userId, puzzleId) pair
    const filtered = queue.filter(
      (p) => !(p.userId === progress.userId && p.puzzleId === progress.puzzleId),
    );
    await writeQueue([...filtered, progress]);
  } catch {
    // Queue write failure is non-critical — progress already logged via console.error
  }
}

/**
 * Attempts to flush all queued FSRS records to Supabase.
 * Called when the app returns to the foreground and the user is authenticated.
 * On success the queue is cleared; on failure it is left intact for the next attempt.
 */
export async function drainSyncQueue(userId: string): Promise<void> {
  try {
    const queue = await readQueue();
    if (queue.length === 0) return;

    const rows = queue.map((p) => ({
      user_id:          p.userId,
      puzzle_id:        p.puzzleId,
      stability:        p.stability,
      difficulty:       p.difficulty,
      retrievability:   p.retrievability,
      state:            p.state,
      lapses:           p.lapses,
      learning_steps:   p.learningSteps,
      repetitions:      p.repetitions,
      last_rating:      p.lastRating,
      last_reviewed_at: p.lastReviewedAt,
      next_review_at:   p.nextReviewAt,
    }));

    const { error } = await supabase
      .from('user_puzzle_progress')
      .upsert(rows, { onConflict: 'user_id,puzzle_id' });

    if (error) {
      console.error('[offlineSync] drain failed:', error.message);
      return; // Keep queue for next attempt
    }

    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    console.error('[offlineSync] drain error:', e);
  }
}

/** Returns true if there are pending records waiting to sync. */
export async function hasPendingSync(): Promise<boolean> {
  try {
    const queue = await readQueue();
    return queue.length > 0;
  } catch {
    return false;
  }
}
