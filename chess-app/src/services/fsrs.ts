import { createEmptyCard, fsrs, State } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';
import type { UserPuzzleProgress, PuzzleId, UserId, FSRSRating } from '@/types';
import {
  FSRS_TARGET_RETENTION,
  FSRS_EASY_THRESHOLD_MS,
  FSRS_HARD_THRESHOLD_MS,
  FSRS_STATE_1_FAST,
  FSRS_STATE_1_SLOW,
  FSRS_STATE_2,
  FSRS_STATE_3,
  FSRS_STATE_4,
  FSRS_STATE_5,
  TIME_FAST_THRESHOLD_MS,
  CROWN_GOLD_PROBABILITY,
} from '@/constants';

export type PuzzleState = 1 | '1b' | 2 | 3 | 4 | 5;
export type CrownType = 'gold' | 'silver' | 'bronze' | null;

export interface PuzzleOutcome {
  state: PuzzleState;
  fsrsRating: FSRSRating;
  crownType: CrownType;
}

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
 * Legacy rating derivation — kept for backward compatibility and tests.
 * New code should use derivePuzzleOutcome instead.
 */
export function deriveFsrsRating(solved: boolean, elapsedMs: number): FSRSRating {
  if (!solved) return 1;
  if (elapsedMs < FSRS_EASY_THRESHOLD_MS) return 4;
  if (elapsedMs < FSRS_HARD_THRESHOLD_MS) return 3;
  return 2;
}

/**
 * Derive puzzle outcome from the 5-state resolution system.
 *
 * State 1  : primera, sin pista, ≤60s → Easy (4),  corona Oro/Plata
 * State 1b : primera, sin pista, >60s → Good (3),  corona Oro/Plata
 * State 2  : primera, con pista       → Good (3),  corona Bronce
 * State 3  : segunda, sin pista       → Hard (2),  corona Bronce
 * State 4  : segunda, con pista       → Hard (2),  corona Bronce
 * State 5  : no resuelto              → Again (1), sin corona
 */
export function derivePuzzleOutcome(
  hintUsed: boolean,
  wrongAttempts: number,
  resolved: boolean,
  elapsedMs: number,
): PuzzleOutcome {
  if (!resolved) {
    return { state: 5, fsrsRating: FSRS_STATE_5, crownType: null };
  }

  const firstAttempt = wrongAttempts === 0;

  if (firstAttempt && !hintUsed) {
    const crownType: CrownType = Math.random() < CROWN_GOLD_PROBABILITY ? 'gold' : 'silver';
    if (elapsedMs <= TIME_FAST_THRESHOLD_MS) {
      return { state: 1, fsrsRating: FSRS_STATE_1_FAST, crownType };
    }
    return { state: '1b', fsrsRating: FSRS_STATE_1_SLOW, crownType };
  }

  if (firstAttempt && hintUsed) {
    return { state: 2, fsrsRating: FSRS_STATE_2, crownType: 'bronze' };
  }

  if (!hintUsed) {
    return { state: 3, fsrsRating: FSRS_STATE_3, crownType: 'bronze' };
  }

  return { state: 4, fsrsRating: FSRS_STATE_4, crownType: 'bronze' };
}
