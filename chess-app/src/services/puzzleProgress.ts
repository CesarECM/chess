import { supabase } from '@/services/supabase';
import {
  loadLocalProgress,
  saveLocalProgress,
  loadDueLocalProgress,
} from '@/services/localProgress';
import { queueForSync } from '@/services/offlineSyncQueue';
import { useAuthStore } from '@/stores/useAuthStore';
import type { UserPuzzleProgress } from '@/types';

// ── DB row ↔ domain type ───────────────────────────────────────────────────────

interface ProgressRow {
  user_id:          string;
  puzzle_id:        string;
  stability:        number;
  difficulty:       number;
  retrievability:   number;
  state:            number;
  lapses:           number;
  learning_steps:   number;
  repetitions:      number;
  last_rating:      number;
  last_reviewed_at: string;
  next_review_at:   string;
}

function rowToProgress(row: ProgressRow): UserPuzzleProgress {
  return {
    userId:         row.user_id,
    puzzleId:       row.puzzle_id,
    stability:      row.stability,
    difficulty:     row.difficulty,
    retrievability: row.retrievability,
    state:          row.state as 0 | 1 | 2 | 3,
    lapses:         row.lapses,
    learningSteps:  row.learning_steps,
    repetitions:    row.repetitions,
    lastRating:     row.last_rating as 1 | 2 | 3 | 4,
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt:   row.next_review_at,
  };
}

function progressToRow(p: UserPuzzleProgress): ProgressRow {
  return {
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
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Fetch the FSRS progress record for a specific user+puzzle pair, or null if first time. */
export async function loadProgress(
  userId: string,
  puzzleId: string,
): Promise<UserPuzzleProgress | null> {
  if (useAuthStore.getState().isGuest) {
    return loadLocalProgress(puzzleId);
  }

  const { data, error } = await supabase
    .from('user_puzzle_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('puzzle_id', puzzleId)
    .single();

  if (error || !data) return null;
  return rowToProgress(data as ProgressRow);
}

/** Upsert the FSRS progress record after a review. Fire-and-forget safe. */
export async function saveProgress(progress: UserPuzzleProgress): Promise<void> {
  if (useAuthStore.getState().isGuest) {
    return saveLocalProgress(progress);
  }

  const { error } = await supabase
    .from('user_puzzle_progress')
    .upsert(progressToRow(progress), { onConflict: 'user_id,puzzle_id' });

  if (error) {
    console.error('[puzzleProgress] saveProgress error:', error.message);
    // Buffer locally so it syncs when connectivity is restored
    await queueForSync(progress);
  }
}

/**
 * Fetch all progress records due for review at or before `now`.
 * Used by the S4.4 review queue.
 */
export async function loadDueProgress(
  userId: string,
  now: Date = new Date(),
): Promise<UserPuzzleProgress[]> {
  if (useAuthStore.getState().isGuest) {
    return loadDueLocalProgress(now);
  }

  const { data, error } = await supabase
    .from('user_puzzle_progress')
    .select('*')
    .eq('user_id', userId)
    .lte('next_review_at', now.toISOString())
    .order('next_review_at', { ascending: true });

  if (error || !data) return [];
  return (data as ProgressRow[]).map(rowToProgress);
}
