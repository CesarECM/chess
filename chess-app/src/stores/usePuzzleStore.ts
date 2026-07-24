import { create } from 'zustand';
import type { Puzzle, PuzzleId, FSRSRating } from '@/types';
import { applyMove } from '@/services/chess';

export type PuzzleStatus = 'idle' | 'playing' | 'failed' | 'reviewing' | 'complete';

export type SubmitMoveResult =
  | { type: 'fail' }
  | { type: 'correct'; opponentMove: string | null }
  | { type: 'complete' };

interface PuzzleState {
  // ── Feed ──────────────────────────────────────────────────────
  currentPuzzle:    Puzzle | null;
  feed:             Puzzle[];
  sessionHistory:   PuzzleId[];
  setCurrentPuzzle: (puzzle: Puzzle) => void;
  setFeed:          (puzzles: Puzzle[]) => void;
  appendToFeed:     (puzzles: Puzzle[]) => void;
  addToHistory:     (puzzleId: PuzzleId) => void;

  // ── Solver ────────────────────────────────────────────────────
  currentFen:       string | null;
  currentMoveIndex: number;
  puzzleStatus:     PuzzleStatus;
  /** FSRS implicit rating computed from solve behavior (set when puzzle ends). */
  lastFsrsRating:   FSRSRating | null;
  setLastFsrsRating: (rating: FSRSRating) => void;
  /** Load a new puzzle and prepare the solver (status → 'idle'). */
  startPuzzle:      (puzzle: Puzzle) => void;
  /**
   * Apply the current move (opponent's turn) to currentFen and advance
   * the index. Returns the UCI string of the played move, or null on error.
   */
  playOpponentMove: () => string | null;
  /**
   * Validate the user's UCI move against the expected solution move.
   * On 'correct', the opponent's reply is already applied to currentFen.
   */
  submitMove:       (uciMove: string) => SubmitMoveResult;
  resetSolver:      () => void;
  /** Transition failed → reviewing: rewinds to puzzle start so the solution can be replayed. */
  startReview:      () => void;
  /**
   * Play the next move in the solution review sequence.
   * Returns the UCI string of the move played, or null if there are no moves left.
   * When the last move is played, status transitions to 'complete'.
   */
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
  setFeed:          (puzzles) => set({ feed: puzzles }),
  appendToFeed:     (puzzles) => set((s) => ({ feed: [...s.feed, ...puzzles] })),
  addToHistory:     (puzzleId) =>
    set((s) => ({ sessionHistory: [...s.sessionHistory, puzzleId] })),

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
      puzzleStatus:     'idle', // hook animates move[0] then transitions to 'playing'
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

    // ── User move is correct ──────────────────────────────────
    const fenAfterUser = applyMove(currentFen, uciMove)!;
    const afterUserIdx = currentMoveIndex + 1;

    if (afterUserIdx >= currentPuzzle.moves.length) {
      set({ currentFen: fenAfterUser, currentMoveIndex: afterUserIdx, puzzleStatus: 'complete' });
      return { type: 'complete' };
    }

    // ── Apply opponent's reply ────────────────────────────────
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
