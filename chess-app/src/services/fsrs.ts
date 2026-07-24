import { createEmptyCard, fsrs, State } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';
import type { UserPuzzleProgress, PuzzleId, UserId, FSRSRating } from '@/types';
import { FSRS_TARGET_RETENTION, FSRS_EASY_THRESHOLD_MS, FSRS_HARD_THRESHOLD_MS } from '@/constants';

// Puzzles don't need intra-day learning steps — new and relearning cards
// schedule straight into Review state based on FSRS stability calculation.
const scheduler = fsrs({
  request_retention: FSRS_TARGET_RETENTION,
  learning_steps:   [],
  relearning_steps: [],
});

// ── Conversions ────────────────────────────────────────────────────────────────

function toCard(p: UserPuzzleProgress, now: Date): Card {
  const lastReview  = new Date(p.lastReviewedAt);
  const nextReview  = new Date(p.nextReviewAt);
  const elapsed_days    = Math.max(0, (now.getTime() - lastReview.getTime()) / 86_400_000);
  const scheduled_days  = Math.max(0, (nextReview.getTime() - lastReview.getTime()) / 86_400_000);

  return {
    due:            nextReview,
    stability:      p.stability,
    difficulty:     p.difficulty,
    elapsed_days,
    scheduled_days,
    learning_steps: p.learningSteps,
    reps:           p.repetitions,
    lapses:         p.lapses,
    state:          p.state as State,
    last_review:    lastReview,
  };
}

function fromCard(card: Card, base: UserPuzzleProgress, rating: FSRSRating, now: Date): UserPuzzleProgress {
  return {
    ...base,
    stability:      card.stability,
    difficulty:     card.difficulty,
    state:          card.state as 0 | 1 | 2 | 3,
    lapses:         card.lapses,
    learningSteps:  card.learning_steps,
    repetitions:    card.reps,
    lastRating:     rating,
    lastReviewedAt: now.toISOString(),
    nextReviewAt:   card.due.toISOString(),
    retrievability: scheduler.get_retrievability(card, now, false),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Create a fresh FSRS progress record for a puzzle the user has never seen. */
export function createProgress(userId: UserId, puzzleId: PuzzleId): UserPuzzleProgress {
  const card = createEmptyCard();
  const now  = new Date().toISOString();
  return {
    userId,
    puzzleId,
    stability:      card.stability,
    difficulty:     card.difficulty,
    retrievability: 1,
    state:          0,
    lapses:         0,
    learningSteps:  0,
    repetitions:    0,
    lastRating:     3,
    lastReviewedAt: now,
    nextReviewAt:   now,
  };
}

/**
 * Process a puzzle review and return the updated progress.
 * @param progress  Current FSRS state for this puzzle/user pair.
 * @param rating    User's implicit grade: 1=Again 2=Hard 3=Good 4=Easy
 * @param now       Review timestamp (defaults to current time; pass a fixed
 *                  date in tests for deterministic results).
 */
export function reviewProgress(
  progress: UserPuzzleProgress,
  rating: FSRSRating,
  now: Date = new Date(),
): UserPuzzleProgress {
  const card       = toCard(progress, now);
  const scheduling = scheduler.repeat(card, now);
  const result     = scheduling[rating];
  return fromCard(result.card, progress, rating, now);
}

/**
 * Current retrievability R ∈ [0, 1] — probability the user still recalls
 * this puzzle at the given time.  R ≈ 0.9 when exactly on schedule.
 */
export function getRetrievability(
  progress: UserPuzzleProgress,
  now: Date = new Date(),
): number {
  const card = toCard(progress, now);
  return scheduler.get_retrievability(card, now, false);
}

/** True when the puzzle is due for review. */
export function isDue(progress: UserPuzzleProgress, now: Date = new Date()): boolean {
  return new Date(progress.nextReviewAt) <= now;
}

/**
 * Derive an implicit FSRS rating from the user's solve behavior.
 *
 * Failed:          Again (1) — user didn't find the solution
 * Solved < 15 s:   Easy  (4) — immediately obvious
 * Solved < 60 s:   Good  (3) — normal effort
 * Solved ≥ 60 s:   Hard  (2) — found it, but struggled
 */
export function deriveFsrsRating(solved: boolean, elapsedMs: number): FSRSRating {
  if (!solved) return 1;
  if (elapsedMs < FSRS_EASY_THRESHOLD_MS) return 4;
  if (elapsedMs < FSRS_HARD_THRESHOLD_MS) return 3;
  return 2;
}
