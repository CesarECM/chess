import { create } from 'zustand';
import type { Puzzle, PuzzleId, FSRSRating, FeedItem, ProgressMessage } from '@/types';
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
  addToHistory:     (puzzleId: PuzzleId) => void;

  // ── Pending progress messages (consumed by FeedScreen) ────────
  pendingMessages:        ProgressMessage[];
  addPendingMessage:      (msg: ProgressMessage) => void;
  clearPendingMessages:   () => void;

  // ── Session state (not persisted — resets on app restart) ─────
  sessionStartElo:            number | null;
  sessionPuzzleCount:         number;
  consecutiveSolvedInSession: number;
  consecutiveFailedInSession: number;
  sessionEloGainShown:        boolean;
  sessionPerfectRun5Shown:    boolean;
  sessionPerfectRun10Shown:   boolean;
  initSession:                (startElo: number) => void;
  recordSolvedInSession:      () => void;
  recordFailedInSession:      () => void;
  markSessionEloGainShown:    () => void;
  markSessionPerfectRun5Shown:  () => void;
  markSessionPerfectRun10Shown: () => void;

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
  addToHistory: (puzzleId) =>
    set((s) => ({ sessionHistory: [...s.sessionHistory, puzzleId] })),

  // ── Pending messages ──────────────────────────────────────────
  pendingMessages:      [],
  addPendingMessage:    (msg) => set((s) => ({ pendingMessages: [...s.pendingMessages, msg] })),
  clearPendingMessages: () => set({ pendingMessages: [] }),

  // ── Session state ──────────────────────────────────────────────
  sessionStartElo:            null,
  sessionPuzzleCount:         0,
  consecutiveSolvedInSession: 0,
  consecutiveFailedInSession: 0,
  sessionEloGainShown:        false,
  sessionPerfectRun5Shown:    false,
  sessionPerfectRun10Shown:   false,

  initSession: (startElo) => set({
    sessionStartElo:            startElo,
    sessionPuzzleCount:         0,
    consecutiveSolvedInSession: 0,
    consecutiveFailedInSession: 0,
    sessionEloGainShown:        false,
    sessionPerfectRun5Shown:    false,
    sessionPerfectRun10Shown:   false,
  }),

  recordSolvedInSession: () => set((s) => ({
    sessionPuzzleCount:         s.sessionPuzzleCount + 1,
    consecutiveSolvedInSession: s.consecutiveSolvedInSession + 1,
    consecutiveFailedInSession: 0,
  })),

  recordFailedInSession: () => set((s) => ({
    sessionPuzzleCount:         s.sessionPuzzleCount + 1,
    consecutiveFailedInSession: s.consecutiveFailedInSession + 1,
    consecutiveSolvedInSession: 0,
  })),

  markSessionEloGainShown:    () => set({ sessionEloGainShown: true }),
  markSessionPerfectRun5Shown:  () => set({ sessionPerfectRun5Shown: true }),
  markSessionPerfectRun10Shown: () => set({ sessionPerfectRun10Shown: true }),

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
