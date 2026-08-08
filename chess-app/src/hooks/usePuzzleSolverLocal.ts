import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import type { Square, PieceSymbol } from 'chess.js';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import type { Puzzle, UserPuzzleProgress, ProgressMessage } from '@/types';
import { applyMove, computeMoveSequence } from '@/services/chess';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { derivePuzzleOutcome, createProgress, reviewProgress } from '@/services/fsrs';
import type { CrownType } from '@/services/fsrs';
import { getOrCreateGuestId } from '@/services/identity';
import { loadProgress, saveProgress } from '@/services/puzzleProgress';
import { recordViralityEvent, recordSkipEvent } from '@/services/virality';
import { recordSolveEvent } from '@/services/solveHistory';
import { trackReferralPuzzle } from '@/services/referral';
import { analytics } from '@/services/analytics';
import { saveDailyResult } from '@/services/dailyPuzzle';
import { syncFreezesToSupabase } from '@/services/auth';
import { showRewardedAdForFreeze } from '@/services/ads';
import { PROGRESS_CARDS_ENABLED, RECALIB_CONSECUTIVE_RECORDS, RECALIB_STREAK_WINDOW_UP } from '@/constants';
import { detectPuzzleEvents, applyDosification } from '@/services/feedMessages';
import { useReinoStore } from '@/stores/useReinoStore';
import {
  detectCrystalEarned,
  recordCrown as recordCrownToDb,
  recordCrystal as recordCrystalToDb,
  recordSolveTime,
  getAndApplySpeedPoints,
  upsertHallProgress,
} from '@/services/reino';
import { getHallForTactic } from '@/constants/reino';
import { useLigaStore } from '@/stores/useLigaStore';
import { assignToLeagueIfNeeded, incrementLigaScore } from '@/services/liga';

export type SolverStatus = 'idle' | 'playing' | 'retry' | 'failed' | 'reviewing' | 'reviewed' | 'complete';

export interface DailyCompleteResult {
  solved:            boolean;
  firstAttemptClean: boolean;
  attempts:          number;
  theme:             string;
}

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
  onDailyComplete?: (result: DailyCompleteResult) => void,
) {
  const [puzzleStatus, setPuzzleStatus] = useState<SolverStatus>('idle');
  const [eloDelta, setEloDelta] = useState<number | null>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [bonusTriggered, setBonusTriggered] = useState<boolean | null>(null);
  const [reviewMoveIndex, setReviewMoveIndex] = useState(0);
  const [solverMoveIndex, setSolverMoveIndex] = useState(0);
  const [reviewedAfterSolve, setReviewedAfterSolve] = useState(false);
  const [hintLevel, setHintLevel]   = useState(0);
  const [hintFromTo, setHintFromTo] = useState<{ from: string; to: string } | null>(null);
  const [lastCrownType, setLastCrownType] = useState<CrownType>(null);
  const [reviewFens, setReviewFens] = useState<string[]>([]);
  const [penaltyResult, setPenaltyResult] = useState<'streakFrozen' | 'streakBroken' | null>(null);
  const [streakBeforeBreak, setStreakBeforeBreak] = useState<number>(0);
  const hintLevelRef = useRef(0);

  // Refs for mutable solver state — avoids stale closures in callbacks
  const fenRef            = useRef(puzzle?.fen ?? '');
  const hasFailedRef      = useRef(false);
  const hintUsedRef       = useRef(false);   // true if ANY hint level was used this puzzle
  const wrongAttemptsRef  = useRef(0);       // count of wrong moves (not hint failures)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const onDailyCompleteRef = useRef(onDailyComplete);
  onDailyCompleteRef.current = onDailyComplete;
  const reviewFensRef = useRef<string[]>([]);
  const reviewSansRef = useRef<string[]>([]);

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
    reviewSansRef.current    = [];
    setReviewFens([]);
    setHasFailed(false);
    hasFailedRef.current    = false;
    hintUsedRef.current     = false;
    wrongAttemptsRef.current = 0;
    setBonusTriggered(null);
    setLastCrownType(null);
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    setReviewMoveIndex(0);
    setSolverMoveIndex(0);
    setReviewedAfterSolve(false);
    hintLevelRef.current = 0;
    setHintLevel(0);
    setHintFromTo(null);
    setPenaltyResult(null);
    setStreakBeforeBreak(0);
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
      setSolverMoveIndex(1);
      setStatus('playing');

      analytics.track('puzzle_loaded', {
        puzzle_id:            puzzle.id,
        difficulty_rating:    puzzle.rating,
        is_easy_injection:    puzzle.isEasyInjection ?? false,
        session_puzzle_index: usePuzzleStore.getState().sessionPuzzleCount,
      });

      if (puzzle.isDailyPuzzle) {
        analytics.track('daily_puzzle_started', {
          puzzle_id: puzzle.id,
          date:      new Date().toISOString().split('T')[0],
        });
      }

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
      // ── Calibration path: no ELO badge ────────────────────────────────────
      const { preEloLow: prevLow, preEloHigh: prevHigh } = useUserStore.getState();
      updatePreElo(puzzleRating, solved, elapsedMs);
      const { preEloLow: newLow, preEloHigh: newHigh, elo: calibratedElo } = useUserStore.getState();

      addToHistory(puzzleId);
      incrementPuzzleStats(solved, puzzle?.themes ?? []);

      // FSRS + El Reino apply during calibration too
      const { fsrsRating: calibFsrsRating, crownType: calibCrownType, state: calibOutcomeState } = derivePuzzleOutcome(
        hintUsedRef.current, wrongAttemptsRef.current, solved, elapsedMs,
      );
      setLastCrownType(calibCrownType);
      const calibProgressBefore = progressRef.current;
      if (calibProgressBefore) {
        const calibUpdated = reviewProgress(calibProgressBefore, calibFsrsRating);
        progressRef.current = calibUpdated;
        saveProgress(calibUpdated).catch(console.error);
      }
      solvedResultRef.current = solved;
      if (solved) {
        if (calibOutcomeState === 1 || calibOutcomeState === '1b') {
          usePuzzleStore.getState().recordFirstAttemptSolvedInSession();
        } else {
          usePuzzleStore.getState().recordSolvedInSession();
        }
        setBonusTriggered(false);
      } else {
        usePuzzleStore.getState().recordFailedInSession();
      }

      // El Reino rewards during calibration
      if (solved) {
        const userId = userIdRef.current ?? '';

        // Después de recordFirstAttemptSolvedInSession, el valor ya fue incrementado
        const calibCleanStreak = usePuzzleStore.getState().consecutiveCleanSolvedInSession;
        const effectiveCalibCrownType = (calibCleanStreak >= 10 && calibCrownType !== null) ? 'gold' : calibCrownType;
        if (effectiveCalibCrownType) {
          useReinoStore.getState().addCrown(effectiveCalibCrownType, puzzleId);
          recordCrownToDb(userId, puzzleId, effectiveCalibCrownType).catch(console.error);
        }

        if (calibProgressBefore && progressRef.current && detectCrystalEarned(calibProgressBefore, progressRef.current)) {
          useReinoStore.getState().addCrystal(puzzleId);
          recordCrystalToDb(userId, puzzleId).catch(console.error);
        }

        // Cristal extra al alcanzar exactamente 10 limpios seguidos
        if (calibCleanStreak === 10) {
          useReinoStore.getState().addCrystal(puzzleId);
          recordCrystalToDb(userId, puzzleId).catch(console.error);
        }

        const tactic = puzzle?.themes[0] ?? 'other';
        const hallId = getHallForTactic(tactic);
        if (hallId) {
          useReinoStore.getState().incrementHallProgress(hallId, puzzleId);
          const hp = useReinoStore.getState().hallProgress[hallId];
          if (hp && userId) {
            upsertHallProgress(userId, hallId, hp.level, hp.puzzlesCount).catch(console.error);
          }
        }

        if (elapsedMs > 0) {
          recordSolveTime(userId, puzzleId, elapsedMs).catch(console.error);
          getAndApplySpeedPoints(userId, puzzleId, elapsedMs, (points, percentile) => {
            if (points > 0) useReinoStore.getState().addSpeedPoints(points, percentile);
          }).catch(console.error);
        }

        // Liga — assign/score
        if (userId) {
          const ligaState = useLigaStore.getState();
          const userElo   = useUserStore.getState().elo;
          if (!ligaState.current) {
            assignToLeagueIfNeeded(userId, userElo).catch(console.error);
          } else {
            incrementLigaScore(userId).catch(console.error);
          }
        }
      }

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

      if (solved) {
        analytics.track('puzzle_solved', {
          puzzle_id:       puzzleId,
          used_hint:       hintUsedRef.current,
          attempts:        wrongAttemptsRef.current,
          time_total_ms:   elapsedMs,
          bonus_triggered: false,
          streak_after:    useUserStore.getState().streakDays,
        });
      }
      return;
    }

    // ── Normal path: FSRS + progress cards + ELO badge ──────────────────────
    const { state: puzzleOutcomeState, fsrsRating, crownType } = derivePuzzleOutcome(
      hintUsedRef.current,
      wrongAttemptsRef.current,
      solved,
      elapsedMs,
    );
    setLastCrownType(crownType);

    const preUser = solved && PROGRESS_CARDS_ENABLED ? {
      elo:              useUserStore.getState().elo,
      eloAllTimeMax:    useUserStore.getState().eloAllTimeMax,
      puzzlesCompleted: useUserStore.getState().puzzlesCompleted,
      unlockedMedals:   [...useUserStore.getState().unlockedMedals],
      eloHistory:       useUserStore.getState().eloHistory,
    } : null;

    const preReino = solved && PROGRESS_CARDS_ENABLED ? {
      totalCrowns:   useReinoStore.getState().crowns.gold + useReinoStore.getState().crowns.silver + useReinoStore.getState().crowns.bronze,
      crystals:      useReinoStore.getState().crystals,
      weeklyPuzzles: useUserStore.getState().weeklyPuzzleCount,
    } : null;

    const preCleanStreak = usePuzzleStore.getState().consecutiveCleanSolvedInSession;
    const isCleanSolve   = solved && (puzzleOutcomeState === 1 || puzzleOutcomeState === '1b');
    const projectedCleanStreakAfter = isCleanSolve ? preCleanStreak + 1 : 0;

    const preSession = solved && PROGRESS_CARDS_ENABLED ? {
      puzzleCount:        usePuzzleStore.getState().sessionPuzzleCount,
      consecutiveSolved:  usePuzzleStore.getState().consecutiveSolvedInSession,
      consecutiveFailed:  usePuzzleStore.getState().consecutiveFailedInSession,
      consecutiveClean:   preCleanStreak,
      eloGainShown:       usePuzzleStore.getState().sessionEloGainShown,
      perfectRun5Shown:   usePuzzleStore.getState().sessionPerfectRun5Shown,
      perfectRun10Shown:  usePuzzleStore.getState().sessionPerfectRun10Shown,
      cleanRun5Shown:     usePuzzleStore.getState().sessionCleanRun5Shown,
      cleanRun10Shown:    usePuzzleStore.getState().sessionCleanRun10Shown,
      gateMessageShown:   usePuzzleStore.getState().sessionGateMessageShown,
      firstAttemptCount:  usePuzzleStore.getState().sessionFirstAttemptSolvedCount,
      nudgeShown:         usePuzzleStore.getState().sessionNudgeShown,
      nudgeThreshold:     usePuzzleStore.getState().sessionNudgeThreshold,
      startElo:           usePuzzleStore.getState().sessionStartElo ?? useUserStore.getState().elo,
    } : null;

    const preFsrs = solved && PROGRESS_CARDS_ENABLED && progressRef.current ? {
      state:            progressRef.current.state,
      reps:             progressRef.current.repetitions,
      stabilityBefore:  progressRef.current.stability,
      reviewsInSession: usePuzzleStore.getState().fsrsReviewsInSession,
      review5Shown:     usePuzzleStore.getState().sessionFsrsReview5Shown,
    } : null;

    const progressBefore  = progressRef.current;
    const updatedProgress = progressBefore
      ? reviewProgress(progressBefore, fsrsRating)
      : null;

    // ── El Reino: crown + crystal + hall + speed ─────────────────────────────
    if (solved) {
      const userId = userIdRef.current ?? '';

      // Crown — override a oro cuando racha limpia ≥ 10
      const effectiveCrownType = (projectedCleanStreakAfter >= 10 && crownType !== null) ? 'gold' : crownType;
      if (effectiveCrownType) {
        useReinoStore.getState().addCrown(effectiveCrownType, puzzleId);
        recordCrownToDb(userId, puzzleId, effectiveCrownType).catch(console.error);
      }

      // Crystal (FSRS long-term memory transition)
      if (updatedProgress && detectCrystalEarned(progressBefore, updatedProgress)) {
        useReinoStore.getState().addCrystal(puzzleId);
        recordCrystalToDb(userId, puzzleId).catch(console.error);
      }

      // Cristal extra al alcanzar exactamente 10 limpios seguidos
      if (projectedCleanStreakAfter === 10) {
        useReinoStore.getState().addCrystal(puzzleId);
        recordCrystalToDb(userId, puzzleId).catch(console.error);
      }

      // Hall progress
      const tactic = puzzle?.themes[0] ?? 'other';
      const hallId = getHallForTactic(tactic);
      if (hallId) {
        useReinoStore.getState().incrementHallProgress(hallId, puzzleId);
        const hp = useReinoStore.getState().hallProgress[hallId];
        if (hp && userId) {
          upsertHallProgress(userId, hallId, hp.level, hp.puzzlesCount).catch(console.error);
        }
      }

      // Speed points (async — fire and forget)
      if (elapsedMs > 0) {
        recordSolveTime(userId, puzzleId, elapsedMs).catch(console.error);
        getAndApplySpeedPoints(userId, puzzleId, elapsedMs, (points, percentile) => {
          if (points > 0) useReinoStore.getState().addSpeedPoints(points, percentile);
        }).catch(console.error);
      }

      // Liga semanal — lazy assignment + score increment
      if (userId) {
        const ligaState = useLigaStore.getState();
        const userElo   = useUserStore.getState().elo;
        if (!ligaState.current) {
          assignToLeagueIfNeeded(userId, userElo).catch(console.error);
        } else {
          incrementLigaScore(userId).catch(console.error);
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    setLastFsrsRating(fsrsRating);
    const eloWin = puzzleOutcomeState === 1 || puzzleOutcomeState === '1b';
    const delta  = updateElo(puzzleRating, eloWin);
    if (eloWin) setEloDelta(delta);
    addToHistory(puzzleId);
    incrementPuzzleStats(solved, puzzle?.themes ?? []);

    // Disparador 3: 5 récords personales consecutivos → recalibración upward mid-session
    if (solved && PROGRESS_CARDS_ENABLED) {
      const { consecutivePersonalBests, elo: currentElo, calibrationBounds, preEloLow } = useUserStore.getState();
      if (preEloLow === null && consecutivePersonalBests >= RECALIB_CONSECUTIVE_RECORDS) {
        const newLow  = Math.max(calibrationBounds.low, currentElo);
        const newHigh = Math.min(calibrationBounds.high, currentElo + RECALIB_STREAK_WINDOW_UP);
        useUserStore.getState().startRecalibration(newLow, newHigh);
        onMessagesEarnedRef.current?.([{
          id:      `recalibration_streak_${Date.now()}`,
          kind:    'progress',
          type:    'recalibration_streak',
          payload: { count: consecutivePersonalBests },
        }]);
      }
    }

    // Variable reward — calculate before recording (consecutiveSolved read pre-increment)
    let bonusResult = false;
    if (solved) {
      const pre  = usePuzzleStore.getState();
      const prob = 0.12
        + (pre.consecutiveSolvedInSession >= 5 ? 0.05 : 0)
        + (pre.puzzlesSinceLastBonus       >= 8 ? 0.10 : 0);
      bonusResult = Math.random() < prob;
    }

    solvedResultRef.current = solved;
    if (solved) {
      if (puzzleOutcomeState === 1 || puzzleOutcomeState === '1b') {
        usePuzzleStore.getState().recordFirstAttemptSolvedInSession();
      } else {
        usePuzzleStore.getState().recordSolvedInSession();
      }
      // Ambicioso sin pista: pagó con vida por no pedir ayuda
      if (puzzleOutcomeState === 3 && useUserStore.getState().preEloLow === null) {
        useReinoStore.getState().loseLife();
      }
      if (bonusResult) usePuzzleStore.getState().resetBonusCounter();
      setBonusTriggered(bonusResult);
    } else {
      usePuzzleStore.getState().recordFailedInSession();
      // T3 tutorial — primer fallo final (estado 5): informar sobre pérdida de vida y cristales
      if (PROGRESS_CARDS_ENABLED && onMessagesEarnedRef.current) {
        const { seenMessageTypes } = useUserStore.getState();
        const { sessionMessageCount } = usePuzzleStore.getState();
        if (sessionMessageCount < 3 && !seenMessageTypes.includes('tutorial_failed_final')) {
          onMessagesEarnedRef.current([{
            id:      `tutorial_failed_final_${Date.now()}`,
            kind:    'progress',
            type:    'tutorial_failed_final',
            payload: {},
          }]);
          useUserStore.getState().markMessageSeen('tutorial_failed_final');
          usePuzzleStore.getState().recordMessageShown();
        }
      }
    }

    if (solved && PROGRESS_CARDS_ENABLED && preUser && preSession && preReino) {
      const { seenMessageTypes } = useUserStore.getState();
      const { sessionMessageCount, lastMessagePuzzleCount, sessionPuzzleCount } = usePuzzleStore.getState();

      const rawMessages = detectPuzzleEvents({
        eloBefore:                preUser.elo,
        eloAfter:                 useUserStore.getState().elo,
        eloAllTimeMax:            preUser.eloAllTimeMax,
        completedBefore:          preUser.puzzlesCompleted,
        completedAfter:           useUserStore.getState().puzzlesCompleted,
        medalsBefore:             preUser.unlockedMedals,
        medalsAfter:              useUserStore.getState().unlockedMedals,
        eloHistoryBefore:         preUser.eloHistory,
        sessionPuzzleCountBefore:    preSession.puzzleCount,
        consecutiveSolvedBefore:     preSession.consecutiveSolved,
        consecutiveFailedBefore:     preSession.consecutiveFailed,
        consecutiveSolvedAfter:      usePuzzleStore.getState().consecutiveSolvedInSession,
        consecutiveCleanSolvedBefore: preSession.consecutiveClean,
        consecutiveCleanSolvedAfter:  usePuzzleStore.getState().consecutiveCleanSolvedInSession,
        sessionStartElo:             preSession.startElo,
        sessionEloGainShown:         preSession.eloGainShown,
        sessionPerfectRun5Shown:     preSession.perfectRun5Shown,
        sessionPerfectRun10Shown:    preSession.perfectRun10Shown,
        sessionCleanRun5Shown:       preSession.cleanRun5Shown,
        sessionCleanRun10Shown:      preSession.cleanRun10Shown,
        sessionGateMessageShown:              preSession.gateMessageShown,
        sessionFirstAttemptSolvedCountAfter:  usePuzzleStore.getState().sessionFirstAttemptSolvedCount,
        sessionNudgeShown:                    preSession.nudgeShown,
        sessionNudgeThreshold:                preSession.nudgeThreshold,
        fsrsStateBefore:             preFsrs?.state ?? 0,
        fsrsRepsBefore:              preFsrs?.reps ?? 0,
        fsrsStabilityBefore:         preFsrs?.stabilityBefore ?? 0,
        fsrsStabilityAfter:          updatedProgress?.stability ?? 0,
        fsrsReviewsInSessionBefore:  preFsrs?.reviewsInSession ?? 0,
        sessionFsrsReview5Shown:     preFsrs?.review5Shown ?? false,
        totalCrownsBefore:           preReino.totalCrowns,
        totalCrownsAfter:            useReinoStore.getState().crowns.gold + useReinoStore.getState().crowns.silver + useReinoStore.getState().crowns.bronze,
        crystalsBefore:              preReino.crystals,
        crystalsAfter:               useReinoStore.getState().crystals,
        weeklyPuzzleCountBefore:     preReino.weeklyPuzzles,
        weeklyPuzzleCountAfter:      useUserStore.getState().weeklyPuzzleCount,
        seenMessageTypes,
        sessionMessageCount,
        lastMessagePuzzleCount,
        sessionPuzzleCountAfter:     sessionPuzzleCount,
        hintUsed:                    hintUsedRef.current,
        puzzleOutcomeState:          puzzleOutcomeState,
      });

      const messages = applyDosification(rawMessages, {
        sessionMessageCount,
        lastMessagePuzzleCount,
        sessionPuzzleCountAfter: sessionPuzzleCount,
      });

      if (messages.length > 0) {
        onMessagesEarnedRef.current?.(messages);
        const hasRegular = messages.some((m) => !['calibration_start','calibration_insight','calibration_midpoint','calibration_complete'].includes(m.type));
        if (hasRegular) {
          usePuzzleStore.getState().recordMessageShown();
          for (const m of messages) {
            if ([
              'reino_crown_first', 'reino_crystal_first', 'liga_intro',
              'tutorial_hint_used', 'tutorial_retry_no_hint', 'tutorial_clean_solve',
            ].includes(m.type)) {
              useUserStore.getState().markMessageSeen(m.type);
            }
          }
        }
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
      if (messages.some((m) => m.type === 'perfect_run_clean' && (m.payload.count as number) === 5)) {
        usePuzzleStore.getState().markSessionCleanRun5Shown();
      }
      if (messages.some((m) => m.type === 'perfect_run_clean' && (m.payload.count as number) === 10)) {
        usePuzzleStore.getState().markSessionCleanRun10Shown();
      }
      if (messages.some((m) => m.type === 'session_gate_reached')) {
        usePuzzleStore.getState().markSessionGateMessageShown();
        const gateMsg = messages.find((m) => m.type === 'session_gate_reached');
        if (gateMsg?.payload.firstQualityIntro) {
          useUserStore.getState().markMessageSeen('gate_quality_intro');
        }
      }
      if (messages.some((m) => m.type === 'session_progress_nudge')) {
        usePuzzleStore.getState().markSessionNudgeShown();
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

    if (solved) {
      analytics.track('puzzle_solved', {
        puzzle_id:       puzzleId,
        used_hint:       hintUsedRef.current,
        attempts:        wrongAttemptsRef.current,
        time_total_ms:   elapsedMs,
        bonus_triggered: bonusResult,
        streak_after:    useUserStore.getState().streakDays,
      });
    }

    if (!useAuthStore.getState().isGuest && userId) {
      trackReferralPuzzle(userId).catch(console.error);
    }

    // Daily puzzle: save result + fire event + notify FeedScreen
    if (puzzle?.isDailyPuzzle) {
      const today            = new Date().toISOString().split('T')[0];
      const attempts         = wrongAttemptsRef.current + 1;
      const firstAttemptClean = solved && wrongAttemptsRef.current === 0 && !hintUsedRef.current;
      const theme            = puzzle.themes[0] ?? 'other';

      const dailyResult = { puzzleId, date: today, solved, firstAttemptClean, attempts, theme };
      saveDailyResult(dailyResult).catch(console.error);

      // Daily rewards (stub for MPS #62 cofres): granted once via countedRef idempotency
      const reinoStore = useReinoStore.getState();
      if (solved) {
        reinoStore.addCrown('gold',   puzzleId);
        reinoStore.addCrown('silver', puzzleId);
        reinoStore.addCrown('silver', puzzleId);
        reinoStore.addCrystal(puzzleId);
        reinoStore.addCrystal(puzzleId);
      } else {
        reinoStore.addCrown('bronze', puzzleId);
      }

      analytics.track('daily_puzzle_completed', {
        puzzle_id:           puzzleId,
        date:                today,
        solved,
        first_attempt_clean: firstAttemptClean,
        attempts,
        theme,
      });

      onDailyCompleteRef.current?.(dailyResult);
    }
  }

  const onUserMove = useCallback((uciMove: string) => {
    if (!puzzle || statusRef.current !== 'playing') return;
    hasAttemptedRef.current = true;
    hintLevelRef.current = 0;
    setHintLevel(0);
    setHintFromTo(null);

    const idx      = moveIndexRef.current;
    const fen      = fenRef.current;
    const expected = puzzle.moves[idx];

    if (normalizeUCI(uciMove) !== normalizeUCI(expected)) {
      const attemptNumber = wrongAttemptsRef.current + 1;
      wrongAttemptsRef.current = attemptNumber;
      const timeSinceStart = solveStartRef.current ? Date.now() - solveStartRef.current : 0;

      analytics.track('puzzle_move_incorrect', {
        puzzle_id:       puzzle.id,
        attempt_number:  attemptNumber,
        time_to_move_ms: timeSinceStart,
      });

      if (!hasFailedRef.current) {
        // First wrong move — free retry: amber flash, auto-reset, no penalty yet
        hasFailedRef.current = true;
        setHasFailed(true);
        analytics.track('puzzle_retry_started', { puzzle_id: puzzle.id });
        boardRef.current?.highlight({ square: uciMove.slice(2, 4) as Square, color: 'rgba(255, 165, 0, 0.75)' });
        setStatus('retry');
        const preFen = fenRef.current;
        retryTimerRef.current = setTimeout(() => {
          boardRef.current?.resetBoard(preFen);
          boardRef.current?.resetAllHighlightedSquares();
          retryTimerRef.current = null;
          setStatus('playing');
        }, 1200);
      } else {
        // Second wrong move — Incorrect_Final
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        const elapsedMs = solveStartRef.current ? Date.now() - solveStartRef.current : 0;
        analytics.track('puzzle_failed_final', {
          puzzle_id:    puzzle.id,
          time_total_ms: elapsedMs,
        });
        recordResult(puzzle.id, puzzle.rating, false);
        if (useUserStore.getState().preEloLow === null) {
          useReinoStore.getState().loseLife();
        }
        setStatus('failed');
      }
      return;
    }

    const fenAfterUser = applyMove(fen, uciMove);
    if (!fenAfterUser) return;
    const afterUserIdx = idx + 1;

    if (afterUserIdx >= puzzle.moves.length) {
      fenRef.current       = fenAfterUser;
      moveIndexRef.current = afterUserIdx;
      setSolverMoveIndex(afterUserIdx);
      setStatus('complete');
      const alreadyCountedA = countedRef.current === puzzle.id && solvedResultRef.current !== true;
      recordResult(puzzle.id, puzzle.rating, true);
      if (alreadyCountedA) {
        analytics.track('puzzle_solved', {
          puzzle_id:       puzzle.id,
          used_hint:       hintUsedRef.current,
          attempts:        wrongAttemptsRef.current,
          time_total_ms:   solveStartRef.current ? Date.now() - solveStartRef.current : 0,
          bonus_triggered: false,
          streak_after:    useUserStore.getState().streakDays,
        });
      }
      return;
    }

    const opponentMove     = puzzle.moves[afterUserIdx];
    const fenAfterOpponent = applyMove(fenAfterUser, opponentMove) ?? fenAfterUser;
    const afterOpponentIdx = afterUserIdx + 1;

    fenRef.current       = fenAfterOpponent;
    moveIndexRef.current = afterOpponentIdx;
    setSolverMoveIndex(afterOpponentIdx);

    if (afterOpponentIdx >= puzzle.moves.length) {
      setStatus('complete');
      const alreadyCountedB = countedRef.current === puzzle.id && solvedResultRef.current !== true;
      recordResult(puzzle.id, puzzle.rating, true);
      if (alreadyCountedB) {
        analytics.track('puzzle_solved', {
          puzzle_id:       puzzle.id,
          used_hint:       hintUsedRef.current,
          attempts:        wrongAttemptsRef.current,
          time_total_ms:   solveStartRef.current ? Date.now() - solveStartRef.current : 0,
          bonus_triggered: false,
          streak_after:    useUserStore.getState().streakDays,
        });
      }
    }

    setTimeout(() => {
      boardRef.current?.move(uciToMove(opponentMove));
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const startReview = useCallback(() => {
    if (!puzzle) return;
    const alreadySolved = countedRef.current === puzzle.id && solvedResultRef.current === true;
    setReviewedAfterSolve(alreadySolved);
    recordResult(puzzle.id, puzzle.rating, false);
    analytics.track('solution_viewed', {
      puzzle_id: puzzle.id,
      context:   alreadySolved ? 'after_solved' : 'after_failed',
    });

    const { fens, sans } = computeMoveSequence(puzzle.fen, puzzle.moves);
    reviewFensRef.current = fens;
    reviewSansRef.current = sans;
    setReviewFens(fens);

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
    setSolverMoveIndex(0);
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

  const jumpToReviewIndex = useCallback((targetIdx: number) => {
    const s = statusRef.current;
    if (s !== 'reviewing' && s !== 'reviewed') return;
    if (!puzzle) return;

    const clamped = Math.max(0, Math.min(targetIdx, puzzle.moves.length));
    boardRef.current?.resetAllHighlightedSquares();

    const targetFen = reviewFensRef.current[clamped] ?? puzzle.fen;
    boardRef.current?.resetBoard(targetFen);
    fenRef.current       = targetFen;
    moveIndexRef.current = clamped;
    setReviewMoveIndex(clamped);
    setStatus(clamped >= puzzle.moves.length ? 'reviewed' : 'reviewing');

    if (clamped > 0) {
      setTimeout(() => { highlightMove(puzzle.moves[clamped - 1]); }, 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  // Progressive hint: returns expected UCI only at level 3 (for PuzzleCard to animate + execute).
  // Levels 1-2 are handled internally (board highlight / hint arrow).
  const requestHint = useCallback((): string | null => {
    if (statusRef.current !== 'playing' || !puzzle) return null;
    const expectedUCI = puzzle.moves[moveIndexRef.current];
    if (!expectedUCI || expectedUCI.length < 4) return null;

    const next = hintLevelRef.current + 1;
    hintLevelRef.current = next;
    setHintLevel(next);

    const from = expectedUCI.slice(0, 2);
    const to   = expectedUCI.slice(2, 4);

    if (next === 1) {
      hintUsedRef.current = true;
      const timeToHint = solveStartRef.current ? Date.now() - solveStartRef.current : 0;
      analytics.track('puzzle_hint_requested', {
        puzzle_id:       puzzle.id,
        time_to_hint_ms: timeToHint,
      });
      boardRef.current?.highlight({ square: from as Square, color: 'rgba(255,215,0,0.85)' });
      setHintFromTo(null);
      // No registrar resultado aquí — se registra al terminar el puzzle (estado 2 o 4)
      hasFailedRef.current = true; // sin free-retry tras pista
      setHasFailed(true);
      return null;
    }
    if (next === 2) {
      boardRef.current?.highlight({ square: from as Square, color: 'rgba(255,215,0,0.85)' });
      setHintFromTo({ from, to });
      return null;
    }
    // Level 3: hand off UCI to PuzzleCard for board animation + solver execution
    setHintFromTo(null);
    return expectedUCI;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id]);

  const handleWatchAdForFreeze = useCallback(() => {
    showRewardedAdForFreeze(() => {
      useUserStore.getState().gainFreeze();
      const { isGuest, user } = useAuthStore.getState();
      const newFreezes = useUserStore.getState().freezes;
      analytics.track('freeze_purchased', { method: 'rewarded_ad' });
      if (!isGuest && user?.id) {
        syncFreezesToSupabase(user.id, newFreezes).catch(() => {});
      }
      setPenaltyResult(null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    puzzleStatus,
    hasFailed,
    bonusTriggered,
    clearBonusTriggered: () => setBonusTriggered(null),
    lastCrownType,
    reviewMoveIndex,
    solverMoveIndex,
    reviewedAfterSolve,
    onUserMove,
    startReview,
    handleAdvanceReview,
    handleBackReview,
    onRetry,
    forceFailure,
    hintLevel,
    hintFromTo,
    requestHint,
    reviewSan: reviewMoveIndex > 0 ? (reviewSansRef.current[reviewMoveIndex - 1] ?? null) : null,
    reviewFens,
    jumpToReviewIndex,
    preEloLow,
    eloDelta,
    clearEloDelta: () => setEloDelta(null),
    getCurrentFen: () => fenRef.current,
    penaltyResult,
    clearPenalty: () => setPenaltyResult(null),
    streakBeforeBreak,
    onWatchAdForFreeze: handleWatchAdForFreeze,
  };
}
