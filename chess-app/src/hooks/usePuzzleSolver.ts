import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Square, PieceSymbol } from 'chess.js';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { useUserStore } from '@/stores/useUserStore';
import { deriveFsrsRating, createProgress, reviewProgress } from '@/services/fsrs';
import { getOrCreateGuestId } from '@/services/identity';
import { loadProgress, saveProgress } from '@/services/puzzleProgress';
import { recordSolveEvent } from '@/services/solveHistory';
import type { UserPuzzleProgress } from '@/types';

function uciToMove(uci: string) {
  return {
    from: uci.slice(0, 2) as Square,
    to:   uci.slice(2, 4) as Square,
    ...(uci.length === 5 && { promotion: uci[4] as PieceSymbol }),
  };
}

const HIGHLIGHT_FROM  = 'rgba(255, 165, 0, 0.75)';
const HIGHLIGHT_TO    = 'rgba(255, 165, 0, 0.50)';

/**
 * Connects the puzzle store to the chessboard ref.
 * Handles: initial opponent forcing-move animation, user move validation,
 * automatic opponent reply animation, and solution review (S2.6).
 */
export function usePuzzleSolver(boardRef: RefObject<ChessboardRef | null>) {
  const puzzleStatus     = usePuzzleStore((s) => s.puzzleStatus);
  const currentPuzzle    = usePuzzleStore((s) => s.currentPuzzle);
  const playOpponentMove = usePuzzleStore((s) => s.playOpponentMove);
  const submitMove       = usePuzzleStore((s) => s.submitMove);
  const startReview      = usePuzzleStore((s) => s.startReview);
  const advanceReview    = usePuzzleStore((s) => s.advanceReview);
  const updateElo             = useUserStore((s) => s.updateElo);
  const incrementCalibration  = useUserStore((s) => s.incrementCalibration);
  const incrementPuzzleStats  = useUserStore((s) => s.incrementPuzzleStats);
  const isCalibrated          = useUserStore((s) => s.isCalibrated);
  const calibrationCount      = useUserStore((s) => s.calibrationCount);
  const setLastFsrsRating     = usePuzzleStore((s) => s.setLastFsrsRating);

  // Tracks which puzzle has already had ELO + calibration counted this session.
  // Prevents double-counting when the user retries a failed puzzle.
  const countedPuzzleRef = useRef<string | null>(null);

  // Millisecond timestamp set after the opponent's first move animation completes.
  // Used to compute elapsed solve time for implicit FSRS rating.
  const solveStartRef = useRef<number | null>(null);

  // FSRS progress loaded from Supabase when the puzzle starts.
  const progressRef = useRef<UserPuzzleProgress | null>(null);
  const userIdRef   = useRef<string | null>(null);

  // Resolve guest ID once; stays stable across puzzles.
  useEffect(() => {
    getOrCreateGuestId().then((id) => { userIdRef.current = id; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function highlightMove(uci: string) {
    const from = uci.slice(0, 2) as Square;
    const to   = uci.slice(2, 4) as Square;
    boardRef.current?.highlight({ square: from, color: HIGHLIGHT_FROM });
    boardRef.current?.highlight({ square: to,   color: HIGHLIGHT_TO });
  }

  // Load FSRS progress whenever the puzzle changes.
  useEffect(() => {
    if (!currentPuzzle) return;
    let cancelled = false;
    (async () => {
      const userId = userIdRef.current ?? await getOrCreateGuestId();
      userIdRef.current = userId;
      const existing = await loadProgress(userId, currentPuzzle.id);
      if (!cancelled) {
        progressRef.current = existing ?? createProgress(userId, currentPuzzle.id);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPuzzle?.id]);

  // When a new puzzle loads (status === 'idle'), reset the board and
  // animate the opponent's forcing move (moves[0]).
  useEffect(() => {
    if (puzzleStatus !== 'idle' || !currentPuzzle) return;

    countedPuzzleRef.current = null;
    solveStartRef.current    = null;
    boardRef.current?.resetBoard(currentPuzzle.fen);

    const timer = setTimeout(() => {
      const opponentUCI = playOpponentMove();
      if (opponentUCI) {
        boardRef.current?.move(uciToMove(opponentUCI));
      }
      // Start the solve timer after the opponent move animation settles (~400 ms)
      setTimeout(() => { solveStartRef.current = Date.now(); }, 400);
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleStatus, currentPuzzle?.id]);

  // When review starts, reset the board to the puzzle's initial FEN and
  // highlight the first move's squares so the user knows what to expect.
  useEffect(() => {
    if (puzzleStatus !== 'reviewing' || !currentPuzzle) return;

    boardRef.current?.resetBoard(currentPuzzle.fen);
    boardRef.current?.resetAllHighlightedSquares();

    const timer = setTimeout(() => {
      if (currentPuzzle.moves[0]) highlightMove(currentPuzzle.moves[0]);
    }, 300);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleStatus, currentPuzzle?.id]);

  /** Called once per puzzle when the result is known. Updates ELO, calibration, and FSRS. */
  function recordResult(puzzleId: string, puzzleRating: number, solved: boolean) {
    if (countedPuzzleRef.current === puzzleId) return;
    countedPuzzleRef.current = puzzleId;

    const elapsedMs  = solveStartRef.current ? Date.now() - solveStartRef.current : 0;
    const fsrsRating = deriveFsrsRating(solved, elapsedMs);

    setLastFsrsRating(fsrsRating);
    updateElo(puzzleRating, solved);
    incrementCalibration();
    incrementPuzzleStats(solved, usePuzzleStore.getState().currentPuzzle?.themes ?? []);

    const userId = userIdRef.current ?? '';
    recordSolveEvent(userId, {
      puzzleId,
      date:     new Date().toISOString(),
      solved,
      tactic:   usePuzzleStore.getState().currentPuzzle?.themes[0] ?? 'other',
      rating:   puzzleRating,
      eloAfter: useUserStore.getState().elo,
    }).catch(console.error);

    // Update and persist FSRS state (fire-and-forget)
    if (progressRef.current) {
      const updated = reviewProgress(progressRef.current, fsrsRating);
      progressRef.current = updated;
      saveProgress(updated).catch(console.error);
    }
  }

  const onUserMove = useCallback(
    (uciMove: string) => {
      const result = submitMove(uciMove);
      if (result.type === 'complete') {
        const puzzle = usePuzzleStore.getState().currentPuzzle;
        if (puzzle) recordResult(puzzle.id, puzzle.rating, true);
      }
      if (result.type === 'correct' && result.opponentMove) {
        setTimeout(() => {
          boardRef.current?.move(uciToMove(result.opponentMove!));
        }, 400);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submitMove, updateElo, incrementCalibration],
  );

  const handleAdvanceReview = useCallback(() => {
    boardRef.current?.resetAllHighlightedSquares();
    const uci = advanceReview();
    if (!uci) return;

    boardRef.current?.move(uciToMove(uci));

    // After the move animation, highlight the next move (if review continues).
    setTimeout(() => {
      const { puzzleStatus: s, currentMoveIndex: idx, currentPuzzle: p } =
        usePuzzleStore.getState();
      if (s === 'reviewing' && p?.moves[idx]) {
        highlightMove(p.moves[idx]);
      }
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceReview]);

  const onStartReview = useCallback(() => {
    const puzzle = usePuzzleStore.getState().currentPuzzle;
    if (puzzle) recordResult(puzzle.id, puzzle.rating, false);
    startReview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startReview, updateElo, incrementCalibration]);

  return {
    puzzleStatus,
    onUserMove,
    startReview: onStartReview,
    handleAdvanceReview,
    isCalibrated,
    calibrationCount,
  };
}
