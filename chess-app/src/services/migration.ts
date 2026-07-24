import { supabase } from './supabase';
import { loadAllLocalProgress, clearLocalProgress } from './localProgress';
import { useUserStore } from '@/stores/useUserStore';

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

/**
 * Migrates all locally stored guest progress to Supabase when a guest creates
 * or logs into an account. Safe to call on every sign-in — exits early if there
 * is nothing to migrate.
 */
export async function migrateGuestProgress(userId: string): Promise<void> {
  const local = await loadAllLocalProgress();
  if (local.length === 0) return;

  // Remap guest userId to the authenticated user's UUID
  const rows: ProgressRow[] = local.map((p) => ({
    user_id:          userId,
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

  const { error: progressError } = await supabase
    .from('user_puzzle_progress')
    .upsert(rows, { onConflict: 'user_id,puzzle_id' });

  if (progressError) {
    console.error('[migration] FSRS upsert failed:', progressError.message);
    return; // Keep local data intact so the user doesn't lose progress
  }

  // Update profile with the ELO and streak the guest accumulated locally
  const { elo, isCalibrated, streakDays } = useUserStore.getState();
  await supabase
    .from('profiles')
    .update({
      elo,
      is_calibrated: isCalibrated,
      streak_current: streakDays,
      streak_longest: streakDays,
    })
    .eq('id', userId);

  await clearLocalProgress();
}
