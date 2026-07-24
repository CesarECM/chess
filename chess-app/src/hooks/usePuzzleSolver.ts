import { useCallback, useEffect, type RefObject } from 'react';
import type { Square, PieceSymbol } from 'chess.js';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import { usePuzzleStore } from '@/stores/usePuzzleStore';

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
  const puzzleStatus    = usePuzzleStore((s) => s.puzzleStatus);
  const currentPuzzle   = usePuzzleStore((s) => s.currentPuzzle);
  const playOpponentMove = usePuzzleStore((s) => s.playOpponentMove);
  const submitMove      = usePuzzleStore((s) => s.submitMove);
  const startReview     = usePuzzleStore((s) => s.startReview);
  const advanceReview   = usePuzzleStore((s) => s.advanceReview);

  function highlightMove(uci: string) {
    const from = uci.slice(0, 2) as Square;
    const to   = uci.slice(2, 4) as Square;
    boardRef.current?.highlight({ square: from, color: HIGHLIGHT_FROM });
    boardRef.current?.highlight({ square: to,   color: HIGHLIGHT_TO });
  }

  // When a new puzzle loads (status === 'idle'), reset the board and
  // animate the opponent's forcing move (moves[0]).
  useEffect(() => {
    if (puzzleStatus !== 'idle' || !currentPuzzle) return;

    boardRef.current?.resetBoard(currentPuzzle.fen);

    const timer = setTimeout(() => {
      const opponentUCI = playOpponentMove();
      if (opponentUCI) {
        boardRef.current?.move(uciToMove(opponentUCI));
      }
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

  const onUserMove = useCallback(
    (uciMove: string) => {
      const result = submitMove(uciMove);
      if (result.type === 'correct' && result.opponentMove) {
        setTimeout(() => {
          boardRef.current?.move(uciToMove(result.opponentMove!));
        }, 400);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submitMove],
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

  return { puzzleStatus, onUserMove, startReview, handleAdvanceReview };
}
