import { createProgress, reviewProgress, getRetrievability, isDue, deriveFsrsRating } from '@/services/fsrs';
import { FSRS_TARGET_RETENTION, FSRS_EASY_THRESHOLD_MS, FSRS_HARD_THRESHOLD_MS } from '@/constants';

const USER   = 'user-test';
const PUZZLE = 'puzzle-test';

// Fixed review date for deterministic results
const T0 = new Date('2026-01-01T12:00:00Z');
const daysAfter = (d: Date, n: number) =>
  new Date(d.getTime() + n * 86_400_000);

// ── createProgress ─────────────────────────────────────────────────────────────

describe('createProgress', () => {
  it('returns a New card with zero reps', () => {
    const p = createProgress(USER, PUZZLE);
    expect(p.userId).toBe(USER);
    expect(p.puzzleId).toBe(PUZZLE);
    expect(p.state).toBe(0); // New
    expect(p.repetitions).toBe(0);
    expect(p.lapses).toBe(0);
    expect(p.retrievability).toBe(1);
  });
});

// ── reviewProgress — first review ─────────────────────────────────────────────

describe('reviewProgress — new card first review', () => {
  const base = createProgress(USER, PUZZLE);

  it('Good (3): schedules next review in a few days with positive stability', () => {
    const p = reviewProgress(base, 3, T0);
    expect(p.stability).toBeGreaterThan(0);
    expect(p.difficulty).toBeGreaterThan(0);
    const nextDays = (new Date(p.nextReviewAt).getTime() - T0.getTime()) / 86_400_000;
    expect(nextDays).toBeGreaterThanOrEqual(1);
    expect(nextDays).toBeLessThanOrEqual(30);
  });

  it('Easy (4): schedules further ahead than Good', () => {
    const pGood = reviewProgress(base, 3, T0);
    const pEasy = reviewProgress(base, 4, T0);
    expect(pEasy.stability).toBeGreaterThan(pGood.stability);
    const nextGood = new Date(pGood.nextReviewAt).getTime();
    const nextEasy = new Date(pEasy.nextReviewAt).getTime();
    expect(nextEasy).toBeGreaterThan(nextGood);
  });

  it('Again (1): schedules next review very soon (short-term learning step)', () => {
    const p = reviewProgress(base, 1, T0);
    const nextDays = (new Date(p.nextReviewAt).getTime() - T0.getTime()) / 86_400_000;
    // Learning step — due within a day
    expect(nextDays).toBeLessThanOrEqual(1);
  });

  it('increments reps each review', () => {
    const p = reviewProgress(base, 3, T0);
    expect(p.repetitions).toBeGreaterThan(0);
  });

  it('records lastRating', () => {
    expect(reviewProgress(base, 1, T0).lastRating).toBe(1);
    expect(reviewProgress(base, 3, T0).lastRating).toBe(3);
    expect(reviewProgress(base, 4, T0).lastRating).toBe(4);
  });
});

// ── reviewProgress — subsequent reviews ───────────────────────────────────────

describe('reviewProgress — stability grows across Good reviews', () => {
  it('stability increases when reviewed on the due date with Good', () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 3, T0);
    // Simulate reviewing exactly on due date (scheduled_days in the future)
    const t1 = daysAfter(T0, Math.ceil(p1.stability));
    const p2 = reviewProgress(p1, 3, t1);
    expect(p2.stability).toBeGreaterThanOrEqual(p1.stability);
  });

  it('Again after Review state increments lapses', () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 4, T0);             // Easy → Review state
    const p2 = reviewProgress(p1, 4, daysAfter(T0, Math.ceil(p1.stability)));
    // Now in Review state; fail it
    const t2 = new Date(p2.nextReviewAt);
    const p3 = reviewProgress(p2, 1, t2);
    expect(p3.lapses).toBeGreaterThan(0);
    // With relearning_steps:[], card stays in Review (no relearning phase) but lapses track forgetting
    expect(p3.state).toBeLessThanOrEqual(3);
  });
});

// ── getRetrievability ─────────────────────────────────────────────────────────

describe('getRetrievability', () => {
  it('is 1 immediately after review on a new card', () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 3, T0);
    const r  = getRetrievability(p1, T0);
    expect(r).toBeCloseTo(1, 1);
  });

  it(`is approximately ${FSRS_TARGET_RETENTION} when elapsed ≈ stability`, () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 3, T0);
    const atDue = new Date(p1.nextReviewAt);
    const r = getRetrievability(p1, atDue);
    expect(r).toBeGreaterThanOrEqual(FSRS_TARGET_RETENTION - 0.05);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('decreases as time passes beyond the scheduled interval', () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 3, T0);
    const r7  = getRetrievability(p1, daysAfter(T0, 7));
    const r14 = getRetrievability(p1, daysAfter(T0, 14));
    expect(r14).toBeLessThan(r7);
  });
});

// ── deriveFsrsRating ──────────────────────────────────────────────────────────

describe('deriveFsrsRating', () => {
  it('failed → Again (1) regardless of elapsed time', () => {
    expect(deriveFsrsRating(false, 0)).toBe(1);
    expect(deriveFsrsRating(false, 5_000)).toBe(1);
    expect(deriveFsrsRating(false, 120_000)).toBe(1);
  });

  it(`solved in < ${FSRS_EASY_THRESHOLD_MS / 1000}s → Easy (4)`, () => {
    expect(deriveFsrsRating(true, 0)).toBe(4);
    expect(deriveFsrsRating(true, FSRS_EASY_THRESHOLD_MS - 1)).toBe(4);
  });

  it(`solved between ${FSRS_EASY_THRESHOLD_MS / 1000}s and ${FSRS_HARD_THRESHOLD_MS / 1000}s → Good (3)`, () => {
    expect(deriveFsrsRating(true, FSRS_EASY_THRESHOLD_MS)).toBe(3);
    expect(deriveFsrsRating(true, 30_000)).toBe(3);
    expect(deriveFsrsRating(true, FSRS_HARD_THRESHOLD_MS - 1)).toBe(3);
  });

  it(`solved in ≥ ${FSRS_HARD_THRESHOLD_MS / 1000}s → Hard (2)`, () => {
    expect(deriveFsrsRating(true, FSRS_HARD_THRESHOLD_MS)).toBe(2);
    expect(deriveFsrsRating(true, 120_000)).toBe(2);
  });
});

// ── isDue ─────────────────────────────────────────────────────────────────────

describe('isDue', () => {
  it('is false immediately after a Good review', () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 3, T0);
    expect(isDue(p1, T0)).toBe(false);
  });

  it('is true when now >= nextReviewAt', () => {
    const p0 = createProgress(USER, PUZZLE);
    const p1 = reviewProgress(p0, 3, T0);
    const due = new Date(p1.nextReviewAt);
    expect(isDue(p1, due)).toBe(true);
    expect(isDue(p1, daysAfter(due, 1))).toBe(true);
  });
});
