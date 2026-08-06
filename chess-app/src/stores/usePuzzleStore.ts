import { create } from 'zustand';
import type { Puzzle, PuzzleId, FSRSRating, FeedItem, ProgressMessage, LockedSlotItem } from '@/types';

export const LOCKED_SLOT: LockedSlotItem = { id: 'locked-slot', kind: 'locked-slot' };
import { applyMove } from '@/services/chess';

export type PuzzleStatus = 'idle' | 'playing' | 'failed' | 'reviewing' | 'complete';

export type SubmitMoveResult =
  | { type: 'fail' }
  | { type: 'correct'; opponentMove: string | null }
  | { type: 'complete' };

interface PuzzleState {
  // ── Feed ──────────────────────────────────────────────────────
  currentPuzzle:    Puzzle | null;
  feed:             FeedItem[];
  sessionHistory:   PuzzleId[];
  setCurrentPuzzle: (puzzle: Puzzle) => void;
  setFeed:          (items: FeedItem[]) => void;
  appendToFeed:     (items: FeedItem[]) => void;
  insertMessagesAfterIndex: (index: number, messages: ProgressMessage[]) => void;
  insertBeforeLockedSlot:   (items: FeedItem[]) => void;
  addToHistory:     (puzzleId: PuzzleId) => void;

  // ── Solved/failed/skipped puzzle tracking (for feed visual state) ──
  solvedPuzzleIds:  string[];
  failedPuzzleIds:  string[];
  skippedPuzzleIds: string[];
  markPuzzleSolved:  (id: string) => void;
  markPuzzleFailed:  (id: string) => void;
  markPuzzleSkipped: (id: string) => void;


  // ── Session state (not persisted — resets on app restart) ─────
  sessionStartElo:               number | null;
  sessionStartTime:              number | null;
  sessionPuzzleCount:            number;
  sessionTotalSolved:            number;
  sessionTotalFailed:            number;
  sessionFirstAttemptSolvedCount: number;
  consecutiveSolvedInSession:    number;
  consecutiveFailedInSession:    number;
  consecutiveCleanSolvedInSession: number;
  sessionCleanRun5Shown:          boolean;
  sessionCleanRun10Shown:         boolean;
  sessionGateMessageShown:        boolean;
  sessionEloGainShown:           boolean;
  sessionPerfectRun5Shown:       boolean;
  sessionPerfectRun10Shown:      boolean;
  fsrsReviewsInSession:          number;
  sessionFsrsReview5Shown:       boolean;
  calibInsightShown:             boolean;
  calibMidpointShown:            boolean;
  sessionCalibInitialRange:      number | null;
  puzzlesSinceLastBonus:         number;
  sessionMessageCount:           number;
  lastMessagePuzzleCount:        number;
  initSession:                   (startElo: number) => void;
  recordSolvedInSession:         () => void;
  recordFirstAttemptSolvedInSession: () => void;
  recordFailedInSession:         () => void;
  resetBonusCounter:             () => void;
  markSessionCleanRun5Shown:     () => void;
  markSessionCleanRun10Shown:    () => void;
  markSessionGateMessageShown:   () => void;
  markSessionEloGainShown:       () => void;
  markSessionPerfectRun5Shown:   () => void;
  markSessionPerfectRun10Shown:  () => void;
  recordFsrsReviewInSession:     () => void;
  markSessionFsrsReview5Shown:   () => void;
  markCalibInsightShown:         () => void;
  markCalibMidpointShown:        () => void;
  setSessionCalibInitialRange:   (range: number) => void;
  recordMessageShown:            () => void;

  // ── Solver ────────────────────────────────────────────────────
  currentFen:       string | null;
  currentMoveIndex: number;
  puzzleStatus:     PuzzleStatus;
  lastFsrsRating:   FSRSRating | null;
  setLastFsrsRating: (rating: FSRSRating) => void;
  startPuzzle:      (puzzle: Puzzle) => void;
  playOpponentMove: () => string | null;
  submitMove:       (uciMove: string) => SubmitMoveResult;
  resetSolver:      () => void;
  startReview:      () => void;
  advanceReview:    () => string | null;
}

function normalizeUCI(uci: string): string {
  return uci.toLowerCase().trim();
}

export const usePuzzleStore = create<PuzzleState>((set, get) => ({
  // ── Feed state ────────────────────────────────────────────────
  currentPuzzle:    null,
  feed:             [],
  sessionHistory:   [],

  setCurrentPuzzle: (puzzle) => set({ currentPuzzle: puzzle }),
  setFeed:          (items) => set({ feed: items }),
  appendToFeed:     (items) => set((s) => ({ feed: [...s.feed, ...items] })),
  insertMessagesAfterIndex: (index, messages) =>
    set((s) => {
      const feed = [...s.feed];
      feed.splice(index + 1, 0, ...messages);
      return { feed };
    }),
  insertBeforeLockedSlot: (items) =>
    set((s) => {
      if (items.length === 0) return {};
      const feed = [...s.feed];
      feed.splice(feed.length - 1, 0, ...items);
      return { feed };
    }),
  addToHistory: (puzzleId) =>
    set((s) => ({ sessionHistory: [...s.sessionHistory, puzzleId] })),

  // ── Solved/failed/skipped tracking ───────────────────────────
  solvedPuzzleIds:  [],
  failedPuzzleIds:  [],
  skippedPuzzleIds: [],
  markPuzzleSolved:  (id) => set((s) => ({ solvedPuzzleIds:  [...s.solvedPuzzleIds, id] })),
  markPuzzleFailed:  (id) => set((s) => ({ failedPuzzleIds:  [...s.failedPuzzleIds, id] })),
  markPuzzleSkipped: (id) => set((s) => ({ skippedPuzzleIds: [...s.skippedPuzzleIds, id] })),

  // ── Session state ──────────────────────────────────────────────
  sessionStartElo:               null,
  sessionStartTime:              null,
  sessionPuzzleCount:            0,
  sessionTotalSolved:            0,
  sessionTotalFailed:            0,
  sessionFirstAttemptSolvedCount: 0,
  consecutiveSolvedInSession:    0,
  consecutiveFailedInSession:    0,
  consecutiveCleanSolvedInSession: 0,
  sessionCleanRun5Shown:          false,
  sessionCleanRun10Shown:         false,
  sessionGateMessageShown:        false,
  sessionEloGainShown:           false,
  sessionPerfectRun5Shown:       false,
  sessionPerfectRun10Shown:      false,
  fsrsReviewsInSession:          0,
  sessionFsrsReview5Shown:       false,
  calibInsightShown:             false,
  calibMidpointShown:            false,
  sessionCalibInitialRange:      null,
  puzzlesSinceLastBonus:         0,
  sessionMessageCount:           0,
  lastMessagePuzzleCount:        -99,

  initSession: (startElo) => set({
    sessionStartElo:               startElo,
    sessionStartTime:              Date.now(),
    sessionPuzzleCount:            0,
    sessionTotalSolved:            0,
    sessionTotalFailed:            0,
    sessionFirstAttemptSolvedCount: 0,
    consecutiveSolvedInSession:    0,
    consecutiveFailedInSession:    0,
    consecutiveCleanSolvedInSession: 0,
    sessionCleanRun5Shown:          false,
    sessionCleanRun10Shown:         false,
    sessionGateMessageShown:        false,
    sessionEloGainShown:           false,
    sessionPerfectRun5Shown:       false,
    sessionPerfectRun10Shown:      false,
    fsrsReviewsInSession:          0,
    sessionFsrsReview5Shown:       false,
    calibInsightShown:             false,
    calibMidpointShown:            false,
    sessionCalibInitialRange:      null,
    puzzlesSinceLastBonus:         0,
    sessionMessageCount:           0,
    lastMessagePuzzleCount:        -99,
  }),

  recordSolvedInSession: () => set((s) => ({
    sessionPuzzleCount:              s.sessionPuzzleCount + 1,
    sessionTotalSolved:              s.sessionTotalSolved + 1,
    consecutiveSolvedInSession:      s.consecutiveSolvedInSession + 1,
    consecutiveFailedInSession:      0,
    consecutiveCleanSolvedInSession: 0,
    puzzlesSinceLastBonus:           s.puzzlesSinceLastBonus + 1,
  })),

  recordFirstAttemptSolvedInSession: () => set((s) => ({
    sessionPuzzleCount:              s.sessionPuzzleCount + 1,
    sessionTotalSolved:              s.sessionTotalSolved + 1,
    sessionFirstAttemptSolvedCount:  s.sessionFirstAttemptSolvedCount + 1,
    consecutiveSolvedInSession:      s.consecutiveSolvedInSession + 1,
    consecutiveFailedInSession:      0,
    consecutiveCleanSolvedInSession: s.consecutiveCleanSolvedInSession + 1,
    puzzlesSinceLastBonus:           s.puzzlesSinceLastBonus + 1,
  })),

  recordFailedInSession: () => set((s) => ({
    sessionPuzzleCount:              s.sessionPuzzleCount + 1,
    sessionTotalFailed:              s.sessionTotalFailed + 1,
    consecutiveFailedInSession:      s.consecutiveFailedInSession + 1,
    consecutiveSolvedInSession:      0,
    consecutiveCleanSolvedInSession: 0,
    puzzlesSinceLastBonus:           s.puzzlesSinceLastBonus + 1,
  })),

  resetBonusCounter: () => set({ puzzlesSinceLastBonus: 0 }),

  markSessionCleanRun5Shown:  () => set({ sessionCleanRun5Shown: true }),
  markSessionCleanRun10Shown: () => set({ sessionCleanRun10Shown: true }),
  markSessionGateMessageShown: () => set({ sessionGateMessageShown: true }),
  markSessionEloGainShown:    () => set({ sessionEloGainShown: true }),
  markSessionPerfectRun5Shown:  () => set({ sessionPerfectRun5Shown: true }),
  markSessionPerfectRun10Shown: () => set({ sessionPerfectRun10Shown: true }),
  recordFsrsReviewInSession:  () => set((s) => ({ fsrsReviewsInSession: s.fsrsReviewsInSession + 1 })),
  markSessionFsrsReview5Shown:  () => set({ sessionFsrsReview5Shown: true }),
  markCalibInsightShown:        () => set({ calibInsightShown: true }),
  markCalibMidpointShown:       () => set({ calibMidpointShown: true }),
  setSessionCalibInitialRange:  (range) => set({ sessionCalibInitialRange: range }),
  recordMessageShown: () => set((s) => ({
    sessionMessageCount:    s.sessionMessageCount + 1,
    lastMessagePuzzleCount: s.sessionPuzzleCount,
  })),

  // ── Solver state ──────────────────────────────────────────────
  currentFen:        null,
  currentMoveIndex:  0,
  puzzleStatus:      'idle',
  lastFsrsRating:    null,
  setLastFsrsRating: (rating) => set({ lastFsrsRating: rating }),

  startPuzzle: (puzzle) =>
    set({
      currentPuzzle:    puzzle,
      currentFen:       puzzle.fen,
      currentMoveIndex: 0,
      puzzleStatus:     'idle',
      lastFsrsRating:   null,
    }),

  playOpponentMove: () => {
    const { currentPuzzle, currentFen, currentMoveIndex } = get();
    if (!currentPuzzle || !currentFen) return null;
    if (currentMoveIndex >= currentPuzzle.moves.length) return null;

    const move   = currentPuzzle.moves[currentMoveIndex];
    const newFen = applyMove(currentFen, move);
    if (!newFen) return null;

    set({ currentFen: newFen, currentMoveIndex: currentMoveIndex + 1, puzzleStatus: 'playing' });
    return move;
  },

  submitMove: (uciMove) => {
    const { currentPuzzle, currentFen, currentMoveIndex, puzzleStatus } = get();
    if (!currentPuzzle || !currentFen || puzzleStatus !== 'playing') return { type: 'fail' };

    const expected = currentPuzzle.moves[currentMoveIndex];
    if (normalizeUCI(uciMove) !== normalizeUCI(expected)) {
      set({ puzzleStatus: 'failed' });
      return { type: 'fail' };
    }

    const fenAfterUser = applyMove(currentFen, uciMove)!;
    const afterUserIdx = currentMoveIndex + 1;

    if (afterUserIdx >= currentPuzzle.moves.length) {
      set({ currentFen: fenAfterUser, currentMoveIndex: afterUserIdx, puzzleStatus: 'complete' });
      return { type: 'complete' };
    }

    const opponentMove      = currentPuzzle.moves[afterUserIdx];
    const fenAfterOpponent  = applyMove(fenAfterUser, opponentMove) ?? fenAfterUser;
    const afterOpponentIdx  = afterUserIdx + 1;

    if (afterOpponentIdx >= currentPuzzle.moves.length) {
      set({ currentFen: fenAfterOpponent, currentMoveIndex: afterOpponentIdx, puzzleStatus: 'complete' });
      return { type: 'correct', opponentMove };
    }

    set({ currentFen: fenAfterOpponent, currentMoveIndex: afterOpponentIdx, puzzleStatus: 'playing' });
    return { type: 'correct', opponentMove };
  },

  resetSolver: () =>
    set({ currentFen: null, currentMoveIndex: 0, puzzleStatus: 'idle' }),

  startReview: () => {
    const { currentPuzzle } = get();
    if (!currentPuzzle) return;
    set({ currentFen: currentPuzzle.fen, currentMoveIndex: 0, puzzleStatus: 'reviewing' });
  },

  advanceReview: () => {
    const { currentPuzzle, currentFen, currentMoveIndex, puzzleStatus } = get();
    if (puzzleStatus !== 'reviewing' || !currentPuzzle || !currentFen) return null;
    if (currentMoveIndex >= currentPuzzle.moves.length) return null;

    const move   = currentPuzzle.moves[currentMoveIndex];
    const newFen = applyMove(currentFen, move);
    if (!newFen) return null;

    const newIdx = currentMoveIndex + 1;
    const done   = newIdx >= currentPuzzle.moves.length;
    set({ currentFen: newFen, currentMoveIndex: newIdx, puzzleStatus: done ? 'complete' : 'reviewing' });
    return move;
  },
}));
