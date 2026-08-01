import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import type { Square, PieceSymbol } from 'chess.js';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import type { Puzzle, UserPuzzleProgress, ProgressMessage } from '@/types';
import { applyMove } from '@/services/chess';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { deriveFsrsRating, createProgress, reviewProgress } from '@/services/fsrs';
import { getOrCreateGuestId } from '@/services/identity';
import { loadProgress, saveProgress } from '@/services/puzzleProgress';
import { recordViralityEvent, recordSkipEvent } from '@/services/virality';
import { recordSolveEvent } from '@/services/solveHistory';
import { trackReferralPuzzle } from '@/services/referral';
import { analytics } from '@/services/analytics';
import { PROGRESS_CARDS_ENABLED } from '@/constants';
import { detectPuzzleEvents } from '@/services/feedMessages';

export type SolverStatus = 'idle' | 'playing' | 'failed' | 'reviewing' | 'reviewed' | 'complete';

const HIGHLIGHT_FROM = 'rgba(255, 165, 0, 0.75)';
const HIGHLIGHT_TO   = 'rgba(255, 165, 0, 0.50)';

function uciToMove(uci: string) {
  return {
    from: uci.slice(0, 2) as Square,
    to:   uci.slice(2, 4) as Square,
    ...(uci.length === 5 && { promotion: uci[4] as PieceSymbol }),
  };
}

function normalizeUCI(uci: string) {
  return uci.toLowerCase().trim();
}

/**
 * Self-contained puzzle solver with local state.
 * Designed for feed cards where multiple puzzle instances coexist.
 * Side effects (ELO, FSRS, history) still flow through global stores.
 */
export function usePuzzleSolverLocal(
  puzzle: Puzzle | null,
  boardRef: RefObject<ChessboardRef | null>,
  isActive: boolean,
  onMessagesEarned?: (messages: ProgressMessage[]) => void,
) {
  const [puzzleStatus, setPuzzleStatus] = useState<SolverStatus>('idle');
  const [eloDelta, setEloDelta] = useState<number | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [reviewMoveIndex, setReviewMoveIndex] = useState(0);

  // Refs for mutable solver state — avoids stale closures in callbacks
  const fenRef        = useRef(puzzle?.fen ?? '');
  const moveIndexRef  = useRef(0);
  const statusRef     = useRef<SolverStatus>('idle');
  const countedRef    = useRef<string | null>(null);
  const solveStartRef = useRef<number | null>(null);
  const progressRef    = useRef<UserPuzzleProgress | null>(null);
  const userIdRef      = useRef<string | null>(null);
  const hasAttemptedRef    = useRef(false);  // true once the user submits any move
  const prevIsActiveRef    = useRef(false);
  const solvedResultRef    = useRef<boolean | null>(null); // null = no result yet
  const onMessagesEarnedRef = useRef(onMessagesEarned);
  onMessagesEarnedRef.current = onMessagesEarned;
  const reviewFensRef = useRef<string[]>([]);

  const updateElo            = useUserStore((s) => s.updateElo);
  const updatePreElo         = useUserStore((s) => s.updatePreElo);
  const incrementPuzzleStats = useUserStore((s) => s.incrementPuzzleStats);
  const preEloLow            = useUserStore((s) => s.preEloLow);
  const addToHistory         = usePuzzleStore((s) => s.addToHistory);
  const setLastFsrsRating     = usePuzzleStore((s) => s.setLastFsrsRating);

  function setStatus(s: SolverStatus) {
    statusRef.current = s;
    setPuzzleStatus(s);
  }

  function highlightMove(uci: string) {
    boardRef.current?.highlight({ square: uci.slice(0, 2) as Square, color: HIGHLIGHT_FROM });
    boardRef.current?.highlight({ square: uci.slice(2, 4) as Square, color: HIGHLIGHT_TO });
  }

  // Resolve guest ID once per component lifetime
  useEffect(() => {
    getOrCreateGuestId().then((id) => { userIdRef.current = id; });
  }, []);

  // Load FSRS progress when puzzle changes (also fires on FlashList recycling)
  useEffect(() => {
    if (!puzzle) return;
    let cancelled = false;
    (async () => {
      const userId = userIdRef.current ?? await getOrCreateGuestId();
      userIdRef.current = userId;
      const existing = await loadProgress(userId, puzzle.id);
      if (!cancelled) {
        progressRef.current = existing ?? createProgress(userId, puzzle.id);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  // Reset solver when puzzle changes (handles FlashList view recycling)
  useEffect(() => {
    if (!puzzle) return;
    fenRef.current           = puzzle.fen;
    moveIndexRef.current     = 0;
    countedRef.current       = null;
    solveStartRef.current    = null;
    hasAttemptedRef.current  = false;
    solvedResultRef.current  = null;
    reviewFensRef.current    = [];
    setHasFailed(false);
    setReviewMoveIndex(0);
    setStatus('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  // When this card loses focus: mark solved/failed if a result was recorded.
  // Skip is no longer detected here — it is handled explicitly by LockedSlot "Ver puzzle".
  // This prevents false-positive marking when the user scrolls backward (puzzle → future).
  useEffect(() => {
    const wasActive = prevIsActiveRef.current;
    prevIsActiveRef.current = isActive;
    if (!wasActive || isActive || !puzzle) return;

    if (solvedResultRef.current !== null) {
      if (solvedResultRef.current) {
        usePuzzleStore.getState().markPuzzleSolved(puzzle.id);
      } else {
        usePuzzleStore.getState().markPuzzleFailed(puzzle.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Animate first opponent move when idle and the card is visible
  useEffect(() => {
    if (puzzleStatus !== 'idle' || !puzzle || !isActive) return;

    boardRef.current?.resetBoard(puzzle.fen);

    // Validate moves[0] against the stored FEN — logs a warning if the puzzle is malformed
    const opponentUCICheck = puzzle.moves[0];
    if (opponentUCICheck && !applyMove(puzzle.fen, opponentUCICheck)) {
      console.warn(`[PUZZLE INVÁLIDO] id=${puzzle.id} rating=${puzzle.rating} moves[0]="${opponentUCICheck}" ilegal en FEN="${puzzle.fen}"`);
    }

    const t = setTimeout(() => {
      const opponentUCI = puzzle.moves[0];
      if (!opponentUCI) return;
      const newFen = applyMove(puzzle.fen, opponentUCI);
      if (!newFen) return;

      boardRef.current?.move(uciToMove(opponentUCI));
      fenRef.current       = newFen;
      moveIndexRef.current = 1;
      setStatus('playing');

      setTimeout(() => { solveStartRef.current = Date.now(); }, 400);
    }, 500);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleStatus, puzzle?.id, isActive]);

  // Review mode: auto-play first move on fresh entry; restore position on re-focus
  useEffect(() => {
    if (puzzleStatus !== 'reviewing' || !puzzle || !isActive) return;

    const idx = moveIndexRef.current;
    boardRef.current?.resetAllHighlightedSquares();

    if (idx === 0) {
      // Fresh start: reset board then auto-play opponent's first move (like puzzle start)
      boardRef.current?.resetBoard(puzzle.fen);
      const t = setTimeout(() => {
        const firstMove = puzzle.moves[0];
        if (!firstMove) return;
        boardRef.current?.move(uciToMove(firstMove));
        const nextFen = reviewFensRef.current[1] ?? applyMove(puzzle.fen, firstMove);
        if (nextFen) fenRef.current = nextFen;
        moveIndexRef.current = 1;
        setReviewMoveIndex(1);
        setTimeout(() => { highlightMove(firstMove); }, 400);
      }, 500);
      return () => clearTimeout(t);
    }

    // Re-focus on an in-progress review: restore current position
    const currentFen = reviewFensRef.current[idx];
    if (currentFen) boardRef.current?.resetBoard(currentFen);
    if (idx > 0) {
      const t = setTimeout(() => { highlightMove(puzzle.moves[idx - 1]); }, 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleStatus, puzzle?.id, isActive]);

  // Records ELO/preElo + FSRS (gated) once per puzzle; idempotent via countedRef
  function recordResult(puzzleId: string, puzzleRating: number, solved: boolean) {
    if (countedRef.current === puzzleId) return;
    countedRef.current = puzzleId;

    const elapsedMs  = solveStartRef.current ? Date.now() - solveStartRef.current : 0;
    const isCalibrating = useUserStore.getState().preEloLow !== null;

    if (isCalibrating) {
      // ── Calibration path: no FSRS, no ELO badge ───────────────────────────
      const { preEloLow: prevLow, preEloHigh: prevHigh } = useUserStore.getState();
      updatePreElo(puzzleRating, solved, elapsedMs);
      const { preEloLow: newLow, preEloHigh: newHigh, elo: calibratedElo } = useUserStore.getState();

      addToHistory(puzzleId);
      incrementPuzzleStats(solved, puzzle?.themes ?? []);
      solvedResultRef.current = solved;
      if (solved) usePuzzleStore.getState().recordSolvedInSession();
      else        usePuzzleStore.getState().recordFailedInSession();

      // ── Calibration message cards ────────────────────────────────────────
      if (PROGRESS_CARDS_ENABLED && onMessagesEarnedRef.current) {
        const store = usePuzzleStore.getState();
        const calibMessages: import('@/types').ProgressMessage[] = [];
        const justCompleted = prevLow !== null && newLow === null;

        if (justCompleted) {
          const eloFloor = Math.floor(calibratedElo / 100) * 100;
          calibMessages.push({
            id:      `calibration_complete_${Date.now()}`,
            kind:    'progress',
            type:    'calibration_complete',
            payload: { bodyIndex: Math.floor(Math.random() * 5), elo: calibratedElo, eloFloor },
          });
        } else if (newLow !== null && newHigh !== null) {
          const currentRange = newHigh - newLow;
          if (!store.calibInsightShown) {
            // First calibration puzzle: record initial range + fire insight card
            if (store.sessionCalibInitialRange === null) {
              store.setSessionCalibInitialRange(prevHigh! - prevLow!);
            }
            calibMessages.push({
              id:      `calibration_insight_${Date.now()}`,
              kind:    'progress',
              type:    'calibration_insight',
              payload: { bodyIndex: Math.floor(Math.random() * 5) },
            });
            store.markCalibInsightShown();
          } else if (!store.calibMidpointShown) {
            const initialRange = store.sessionCalibInitialRange ?? (prevHigh! - prevLow!);
            if (currentRange < initialRange * 0.5) {
              calibMessages.push({
                id:      `calibration_midpoint_${Date.now()}`,
                kind:    'progress',
                type:    'calibration_midpoint',
                payload: { bodyIndex: Math.floor(Math.random() * 5) },
              });
              store.markCalibMidpointShown();
            }
          }
        }

        if (calibMessages.length > 0) {
          onMessagesEarnedRef.current(calibMessages);
        }
      }
      // ────────────────────────────────────────────────────────────────────

      const userId = userIdRef.current ?? '';
      recordSolveEvent(userId, {
        puzzleId,
        date:     new Date().toISOString(),
        solved,
        tactic:   puzzle?.themes[0] ?? 'other',
        rating:   puzzleRating,
        eloAfter: useUserStore.getState().elo,
      }).catch(console.error);

      recordViralityEvent(puzzleId, solved, elapsedMs).catch(console.error);

      analytics.track(solved ? 'puzzle_completed' : 'puzzle_failed', {
        puzzle_id:   puzzleId,
        rating:      puzzleRating,
        elapsed_ms:  elapsedMs,
        tactic:      puzzle?.themes[0] ?? 'other',
        calibrating: true,
      });
      return;
    }

    // ── Normal path: FSRS + progress cards + ELO badge ──────────────────────
    const fsrsRating = deriveFsrsRating(solved, elapsedMs);

    const preUser = solved && PROGRESS_CARDS_ENABLED ? {
      elo:             useUserStore.getState().elo,
      puzzlesCompleted: useUserStore.getState().puzzlesCompleted,
      unlockedMedals:  [...useUserStore.getState().unlockedMedals],
      eloHistory:      useUserStore.getState().eloHistory,
    } : null;

    const preSession = solved && PROGRESS_CARDS_ENABLED ? {
      puzzleCount:        usePuzzleStore.getState().sessionPuzzleCount,
      consecutiveSolved:  usePuzzleStore.getState().consecutiveSolvedInSession,
      consecutiveFailed:  usePuzzleStore.getState().consecutiveFailedInSession,
      eloGainShown:       usePuzzleStore.getState().sessionEloGainShown,
      perfectRun5Shown:   usePuzzleStore.getState().sessionPerfectRun5Shown,
      perfectRun10Shown:  usePuzzleStore.getState().sessionPerfectRun10Shown,
      startElo:           usePuzzleStore.getState().sessionStartElo ?? useUserStore.getState().elo,
    } : null;

    const preFsrs = solved && PROGRESS_CARDS_ENABLED && progressRef.current ? {
      state:            progressRef.current.state,
      reps:             progressRef.current.repetitions,
      stabilityBefore:  progressRef.current.stability,
      reviewsInSession: usePuzzleStore.getState().fsrsReviewsInSession,
      review5Shown:     usePuzzleStore.getState().sessionFsrsReview5Shown,
    } : null;

    const updatedProgress = progressRef.current
      ? reviewProgress(progressRef.current, fsrsRating)
      : null;

    setLastFsrsRating(fsrsRating);
    const delta = updateElo(puzzleRating, solved);
    setEloDelta(delta);
    addToHistory(puzzleId);
    incrementPuzzleStats(solved, puzzle?.themes ?? []);

    solvedResultRef.current = solved;
    if (solved) {
      usePuzzleStore.getState().recordSolvedInSession();
    } else {
      usePuzzleStore.getState().recordFailedInSession();
    }

    if (solved && PROGRESS_CARDS_ENABLED && preUser && preSession) {
      const messages = detectPuzzleEvents({
        eloBefore:                preUser.elo,
        eloAfter:                 useUserStore.getState().elo,
        completedBefore:          preUser.puzzlesCompleted,
        completedAfter:           useUserStore.getState().puzzlesCompleted,
        medalsBefore:             preUser.unlockedMedals,
        medalsAfter:              useUserStore.getState().unlockedMedals,
        eloHistoryBefore:         preUser.eloHistory,
        sessionPuzzleCountBefore: preSession.puzzleCount,
        consecutiveSolvedBefore:  preSession.consecutiveSolved,
        consecutiveFailedBefore:  preSession.consecutiveFailed,
        consecutiveSolvedAfter:   usePuzzleStore.getState().consecutiveSolvedInSession,
        sessionStartElo:             preSession.startElo,
        sessionEloGainShown:         preSession.eloGainShown,
        sessionPerfectRun5Shown:     preSession.perfectRun5Shown,
        sessionPerfectRun10Shown:    preSession.perfectRun10Shown,
        fsrsStateBefore:             preFsrs?.state ?? 0,
        fsrsRepsBefore:              preFsrs?.reps ?? 0,
        fsrsStabilityBefore:         preFsrs?.stabilityBefore ?? 0,
        fsrsStabilityAfter:          updatedProgress?.stability ?? 0,
        fsrsReviewsInSessionBefore:  preFsrs?.reviewsInSession ?? 0,
        sessionFsrsReview5Shown:     preFsrs?.review5Shown ?? false,
      });

      if (messages.length > 0) {
        onMessagesEarnedRef.current?.(messages);
      }

      if (messages.some((m) => m.type === 'session_elo_gain')) {
        usePuzzleStore.getState().markSessionEloGainShown();
      }
      if (messages.some((m) => m.type === 'perfect_run' && (m.payload.count as number) === 5)) {
        usePuzzleStore.getState().markSessionPerfectRun5Shown();
      }
      if (messages.some((m) => m.type === 'perfect_run' && (m.payload.count as number) === 10)) {
        usePuzzleStore.getState().markSessionPerfectRun10Shown();
      }
      if (messages.some((m) => m.type === 'fsrs_review_session')) {
        usePuzzleStore.getState().markSessionFsrsReview5Shown();
      }
      if (preFsrs && preFsrs.state >= 2) {
        usePuzzleStore.getState().recordFsrsReviewInSession();
      }
    }

    const userId = userIdRef.current ?? '';
    recordSolveEvent(userId, {
      puzzleId,
      date:     new Date().toISOString(),
      solved,
      tactic:   puzzle?.themes[0] ?? 'other',
      rating:   puzzleRating,
      eloAfter: useUserStore.getState().elo,
    }).catch(console.error);

    if (updatedProgress) {
      progressRef.current = updatedProgress;
      saveProgress(updatedProgress).catch(console.error);
    }

    recordViralityEvent(puzzleId, solved, elapsedMs).catch(console.error);

    analytics.track(solved ? 'puzzle_completed' : 'puzzle_failed', {
      puzzle_id:  puzzleId,
      rating:     puzzleRating,
      elapsed_ms: elapsedMs,
      tactic:     puzzle?.themes[0] ?? 'other',
      elo:        useUserStore.getState().elo,
    });

    if (!useAuthStore.getState().isGuest && userId) {
      trackReferralPuzzle(userId).catch(console.error);
    }
  }

  const onUserMove = useCallback((uciMove: string) => {
    if (!puzzle || statusRef.current !== 'playing') return;
    hasAttemptedRef.current = true;

    const idx      = moveIndexRef.current;
    const fen      = fenRef.current;
    const expected = puzzle.moves[idx];

    if (normalizeUCI(uciMove) !== normalizeUCI(expected)) {
      recordResult(puzzle.id, puzzle.rating, false);
      setHasFailed(true);
      setStatus('failed');
      return;
    }

    const fenAfterUser = applyMove(fen, uciMove);
    if (!fenAfterUser) return;
    const afterUserIdx = idx + 1;

    if (afterUserIdx >= puzzle.moves.length) {
      fenRef.current       = fenAfterUser;
      moveIndexRef.current = afterUserIdx;
      setStatus('complete');
      recordResult(puzzle.id, puzzle.rating, true);
      return;
    }

    const opponentMove     = puzzle.moves[afterUserIdx];
    const fenAfterOpponent = applyMove(fenAfterUser, opponentMove) ?? fenAfterUser;
    const afterOpponentIdx = afterUserIdx + 1;

    fenRef.current       = fenAfterOpponent;
    moveIndexRef.current = afterOpponentIdx;

    if (afterOpponentIdx >= puzzle.moves.length) {
      setStatus('complete');
      recordResult(puzzle.id, puzzle.rating, true);
    }

    setTimeout(() => {
      boardRef.current?.move(uciToMove(opponentMove));
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const startReview = useCallback(() => {
    if (!puzzle) return;
    recordResult(puzzle.id, puzzle.rating, false);

    // Pre-compute all FENs for back/forward navigation
    const fens: string[] = [puzzle.fen];
    let fen = puzzle.fen;
    for (const move of puzzle.moves) {
      const next = applyMove(fen, move);
      if (!next) break;
      fens.push(next);
      fen = next;
    }
    reviewFensRef.current = fens;

    fenRef.current       = puzzle.fen;
    moveIndexRef.current = 0;
    setReviewMoveIndex(0);
    setStatus('reviewing');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const handleAdvanceReview = useCallback(() => {
    const s = statusRef.current;
    if (s !== 'reviewing' && s !== 'reviewed') return;
    if (!puzzle) return;

    const idx = moveIndexRef.current;
    if (idx >= puzzle.moves.length) return;

    boardRef.current?.resetAllHighlightedSquares();

    const move   = puzzle.moves[idx];
    const newFen = reviewFensRef.current[idx + 1] ?? applyMove(fenRef.current, move);
    if (!newFen) return;

    boardRef.current?.move(uciToMove(move));

    const newIdx = idx + 1;
    const done   = newIdx >= puzzle.moves.length;

    fenRef.current       = newFen;
    moveIndexRef.current = newIdx;
    setReviewMoveIndex(newIdx);
    setStatus(done ? 'reviewed' : 'reviewing');

    if (!done) {
      setTimeout(() => {
        if (puzzle.moves[newIdx]) highlightMove(puzzle.moves[newIdx]);
      }, 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const handleBackReview = useCallback(() => {
    const s = statusRef.current;
    if (s !== 'reviewing' && s !== 'reviewed') return;
    if (!puzzle) return;

    const idx = moveIndexRef.current;
    if (idx <= 0) return;

    boardRef.current?.resetAllHighlightedSquares();

    const prevIdx = idx - 1;
    const prevFen = reviewFensRef.current[prevIdx] ?? puzzle.fen;

    boardRef.current?.resetBoard(prevFen);
    fenRef.current       = prevFen;
    moveIndexRef.current = prevIdx;
    setReviewMoveIndex(prevIdx);
    setStatus('reviewing');

    if (prevIdx > 0) {
      setTimeout(() => { highlightMove(puzzle.moves[prevIdx - 1]); }, 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const onRetry = useCallback(() => {
    if (!puzzle) return;
    fenRef.current        = puzzle.fen;
    moveIndexRef.current  = 0;
    setStatus('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  // Called externally (e.g. LockedSlot "Ver puzzle") to force a failure record.
  // Idempotent: no-op if a result was already counted.
  const forceFailure = useCallback(() => {
    if (!puzzle || countedRef.current === puzzle.id) return;
    hasAttemptedRef.current = true;
    solvedResultRef.current = false;
    recordResult(puzzle.id, puzzle.rating, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  return {
    puzzleStatus,
    hasFailed,
    reviewMoveIndex,
    onUserMove,
    startReview,
    handleAdvanceReview,
    handleBackReview,
    onRetry,
    forceFailure,
    preEloLow,
    eloDelta,
    clearEloDelta: () => setEloDelta(null),
  };
}
