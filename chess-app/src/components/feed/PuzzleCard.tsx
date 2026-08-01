import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Square, PieceSymbol } from 'chess.js';
import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import type { BoardArrow } from '@/components/chess/ChessBoard';
import { applyMove, isGameOver } from '@/services/chess';
import { EvalBar } from '@/components/chess/EvalBar';
import { useTheme } from '@/hooks/useTheme';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { usePuzzleSolverLocal, type SolverStatus } from '@/hooks/usePuzzleSolverLocal';
import { useShareCard } from '@/hooks/useShareCard';
import { useAnalysis } from '@/services/analysis/useAnalysis';
import { EloDeltaBadge } from '@/components/feed/EloDeltaBadge';
import { CalibrationBar } from '@/components/feed/CalibrationBar';
import { RangeBadge } from '@/components/ui/RangeBadge';
import { ShareCard } from '@/components/ui/ShareCard';
import type { Puzzle, ProgressMessage } from '@/types';

const DESKTOP_PANEL_WIDTH = 320;
const PIECE_COLOR_WHITE   = '#f0d9b5';
const PIECE_COLOR_BLACK   = '#4a3728';

const STATUS_COLOR: Record<SolverStatus, keyof ReturnType<typeof useTheme>['colors']> = {
  idle:      'textSecondary',
  playing:   'textSecondary',
  failed:    'error',
  reviewing: 'textSecondary',
  reviewed:  'error',
  complete:  'success',
};

interface Props {
  puzzle: Puzzle;
  height: number;
  isActive: boolean;
  feedIndex: number;
  onComplete: () => void;
  onStatusChange?: (status: SolverStatus) => void;
  onMessagesEarned?: (messages: ProgressMessage[], feedIndex: number) => void;
  backgroundColor?: string;
  onForceFailRef?: MutableRefObject<(() => void) | null>;
  onDebugLog?: (tag: string, msg: string) => void;
}

function PuzzleCardComponent({
  puzzle, height, isActive, feedIndex,
  onComplete, onStatusChange, onMessagesEarned, backgroundColor, onForceFailRef, onDebugLog,
}: Props) {
  const { colors, typography } = useTheme();
  const { t }        = useTranslation();
  const isDesktop    = useIsDesktop();
  const boardRef     = useRef<ChessboardRef>(null);
  const [boardColW, setBoardColW]         = useState(0);
  const [boardSectionSize, setBoardSectionSize] = useState(0);
  const [explorationFen, setExplorationFen]     = useState<string | null>(null);
  const [analyzedFen, setAnalyzedFen]           = useState<string | null>(null);
  const [isAutoplaying, setIsAutoplaying]       = useState(false);
  const [isVsEngine, setIsVsEngine]             = useState(false);
  const [vsEngineWaiting, setVsEngineWaiting]   = useState(false);
  const [vsEngineOver, setVsEngineOver]         = useState(false);
  const vsEngineFenRef      = useRef('');
  const vsEngineStartFenRef = useRef('');
  const isAutoplayingRef    = useRef(false);
  const autoplayTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrappedAdvanceReviewRef = useRef<() => void>(() => {});

  const elo              = useUserStore((s) => s.elo);
  const preEloLow        = useUserStore((s) => s.preEloLow);
  const preEloHigh       = useUserStore((s) => s.preEloHigh);
  const preEloStartLow   = useUserStore((s) => s.preEloStartLow);
  const preEloStartHigh  = useUserStore((s) => s.preEloStartHigh);
  const streakDays       = useUserStore((s) => s.streakDays);
  const puzzlesCompleted = useUserStore((s) => s.puzzlesCompleted);
  const sessionCount     = usePuzzleStore((s) => s.sessionPuzzleCount);

  const { cardRef, isSharing, captureAndShare } = useShareCard();
  const { state: analysisState, analyze, reset: resetAnalysisRaw } = useAnalysis();

  const isAnalysisOpen = analysisState.status !== 'idle';

  const handleResetAnalysis = useCallback(() => {
    setExplorationFen(null);
    setAnalyzedFen(null);
    resetAnalysisRaw();
  }, [resetAnalysisRaw]);

  // Reset analysis + exploration when puzzle changes or card becomes inactive
  useEffect(() => {
    if (!isActive) {
      setExplorationFen(null);
      setAnalyzedFen(null);
      setIsVsEngine(false);
      setVsEngineWaiting(false);
      setVsEngineOver(false);
      resetAnalysisRaw();
    }
  }, [isActive, puzzle.id, resetAnalysisRaw]);

  // Stable ref so callbacks created once always see the latest getCurrentFen
  const getCurrentFenRef = useRef<() => string>(() => '');

  // Derive up to 3 arrows from current analysis pvs — hidden in vs-engine mode (no peeking)
  const analysisArrows = useMemo<BoardArrow[]>(() => {
    if (isVsEngine) return [];
    const pvs =
      analysisState.status === 'ready'    ? analysisState.result.pvs :
      analysisState.status === 'thinking' ? analysisState.pvs :
      null;
    if (!pvs) return [];
    const arrowColors = [
      'rgba(50,200,50,0.85)',
      'rgba(50,200,50,0.50)',
      'rgba(50,200,50,0.25)',
    ];
    return pvs.slice(0, 3).flatMap((pv, i) => {
      const uci = pv.moves?.split(' ')[0];
      if (!uci || uci.length < 4) return [];
      return [{ from: uci.slice(0, 2), to: uci.slice(2, 4), color: arrowColors[i] }];
    });
  }, [isVsEngine, analysisState]);

  const handleMessagesEarned = useCallback(
    (msgs: ProgressMessage[]) => onMessagesEarned?.(msgs, feedIndex),
    [feedIndex, onMessagesEarned],
  );

  const {
    puzzleStatus, hasFailed, reviewMoveIndex, reviewedAfterSolve,
    onUserMove, startReview, handleAdvanceReview, handleBackReview, onRetry,
    forceFailure, hintLevel, hintFromTo, requestHint,
    reviewSan,
    eloDelta, clearEloDelta, getCurrentFen,
  } = usePuzzleSolverLocal(puzzle, boardRef, isActive, handleMessagesEarned);

  // Keep a stable ref so callbacks always see the latest getCurrentFen
  getCurrentFenRef.current = getCurrentFen;

  // Engine response: fires when analysis completes while waiting for the engine's move
  useEffect(() => {
    if (!isVsEngine || !vsEngineWaiting) return;
    if (analysisState.status !== 'ready') return;

    const bestMove = analysisState.result.pvs[0]?.moves?.split(' ')[0];
    if (!bestMove || bestMove.length < 4) {
      setVsEngineWaiting(false);
      return;
    }

    const newFen = applyMove(vsEngineFenRef.current, bestMove);
    if (!newFen) {
      setVsEngineWaiting(false);
      return;
    }

    setTimeout(() => {
      boardRef.current?.move({
        from:      bestMove.slice(0, 2) as Square,
        to:        bestMove.slice(2, 4) as Square,
        promotion: bestMove.length === 5 ? (bestMove[4] as PieceSymbol) : undefined,
      });
      vsEngineFenRef.current = newFen;
      setVsEngineWaiting(false);
      if (isGameOver(newFen)) setVsEngineOver(true);
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVsEngine, vsEngineWaiting, analysisState]);

  const isCalibrating = preEloLow !== null;

  useEffect(() => {
    if (!onForceFailRef) return;
    onForceFailRef.current = forceFailure;
    return () => { onForceFailRef.current = null; };
  }, [forceFailure, onForceFailRef]);

  useEffect(() => {
    if (!isActive) return;
    onDebugLog?.('PUZZLE', `id=${puzzle.id} r=${puzzle.rating} moves=${puzzle.moves.slice(0,3).join(' ')} fen="${puzzle.fen.split(' ').slice(0,2).join(' ')}"`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, puzzle.id]);

  const playerColor    = puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white';
  const opponentColor  = playerColor === 'white' ? 'black' : 'white';
  const playerBarColor   = playerColor   === 'white' ? PIECE_COLOR_WHITE : PIECE_COLOR_BLACK;
  const opponentBarColor = opponentColor === 'white' ? PIECE_COLOR_WHITE : PIECE_COLOR_BLACK;

  useEffect(() => {
    if (isActive) onStatusChange?.(puzzleStatus);
  }, [puzzleStatus, isActive, onStatusChange]);

  const statusColor = (puzzleStatus === 'reviewed' && reviewedAfterSolve)
    ? colors[STATUS_COLOR['complete']]
    : colors[STATUS_COLOR[puzzleStatus]];

  const statusLabels = useMemo<Record<SolverStatus, string>>(() => ({
    idle:      t('puzzle.statusIdle'),
    playing:   t('puzzle.statusPlaying'),
    failed:    t('puzzle.statusFailed'),
    reviewing: t('puzzle.statusReviewing'),
    reviewed:  reviewedAfterSolve ? t('puzzle.statusReviewedSolved') : t('puzzle.statusReviewed'),
    complete:  t('puzzle.statusComplete'),
  }), [t, reviewedAfterSolve]);

  // Wrapper central: registra el FEN analizado + dispara el motor
  const runAnalysis = useCallback((fen: string) => {
    setAnalyzedFen(fen);
    analyze(fen);
  }, [analyze]);

  // Unified board move handler
  const handleBoardMove = useCallback((uci: string, newFen: string) => {
    if (puzzleStatus === 'playing') {
      onUserMove(uci);
      return;
    }
    if (isVsEngine) {
      if (isGameOver(newFen)) {
        vsEngineFenRef.current = newFen;
        setVsEngineOver(true);
        return;
      }
      vsEngineFenRef.current = newFen;
      setVsEngineWaiting(true);
      analyze(newFen);
      return;
    }
    if (isAnalysisOpen) {
      setExplorationFen(newFen);
      runAnalysis(newFen);
    }
    // During review without analysis: purely visual — ChessBoard handles it internally
  }, [puzzleStatus, isVsEngine, isAnalysisOpen, onUserMove, analyze, runAnalysis]);

  // Trigger analysis — use explorationFen if already exploring, else main line
  const handleAnalyze = useCallback(() => {
    runAnalysis(explorationFen ?? getCurrentFenRef.current());
  }, [runAnalysis, explorationFen]);

  // Return to main line from exploration
  const handleBackToMainLine = useCallback(() => {
    const mainFen = getCurrentFenRef.current();
    setExplorationFen(null);
    boardRef.current?.resetBoard(mainFen);
    runAnalysis(mainFen);
  }, [runAnalysis]);

  // Enter vs-engine mode from the current analysis position
  const handleStartVsEngine = useCallback(() => {
    const startFen = explorationFen ?? getCurrentFenRef.current();
    vsEngineStartFenRef.current = startFen;
    vsEngineFenRef.current      = startFen;
    setIsVsEngine(true);
    setVsEngineWaiting(false);
    setVsEngineOver(false);
  }, [explorationFen]);

  // Exit vs-engine — restore the position we entered from and resume analysis
  const handleExitVsEngine = useCallback(() => {
    const returnFen = vsEngineStartFenRef.current;
    setIsVsEngine(false);
    setVsEngineWaiting(false);
    setVsEngineOver(false);
    boardRef.current?.resetBoard(returnFen);
    setExplorationFen(null);
    runAnalysis(returnFen);
  }, [runAnalysis]);

  // Review nav wrappers — clear exploration + re-analyze when analysis is open
  const wrappedAdvanceReview = useCallback(() => {
    setExplorationFen(null);
    handleAdvanceReview();
    if (isAnalysisOpen) analyze(getCurrentFenRef.current());
  }, [handleAdvanceReview, isAnalysisOpen, analyze]);

  const wrappedBackReview = useCallback(() => {
    setExplorationFen(null);
    handleBackReview();
    if (isAnalysisOpen) analyze(getCurrentFenRef.current());
  }, [handleBackReview, isAnalysisOpen, analyze]);

  // Keep stable ref so autoplay timer always calls the latest version
  wrappedAdvanceReviewRef.current = wrappedAdvanceReview;

  // Autoplay
  const stopAutoplay = useCallback(() => {
    isAutoplayingRef.current = false;
    if (autoplayTimerRef.current) { clearTimeout(autoplayTimerRef.current); autoplayTimerRef.current = null; }
    setIsAutoplaying(false);
  }, []);

  const startAutoplay = useCallback(() => {
    let stepsLeft = puzzle.moves.length - reviewMoveIndex;
    if (stepsLeft <= 0) return;
    isAutoplayingRef.current = true;
    setIsAutoplaying(true);

    const step = () => {
      if (!isAutoplayingRef.current) return;
      stepsLeft--;
      wrappedAdvanceReviewRef.current();
      if (stepsLeft > 0) {
        autoplayTimerRef.current = setTimeout(step, 700);
      } else {
        isAutoplayingRef.current = false;
        setIsAutoplaying(false);
      }
    };
    autoplayTimerRef.current = setTimeout(step, 700);
  }, [puzzle.moves.length, reviewMoveIndex]);

  // Stop autoplay when card loses focus or puzzle changes
  useEffect(() => {
    if (!isActive) stopAutoplay();
  }, [isActive, puzzle.id, stopAutoplay]);

  // Click en un PV: ejecuta los 2 primeros movimientos de la línea (user + rival) con animación
  const handlePvClick = useCallback((pvMoves: string) => {
    const baseFen = analyzedFen ?? getCurrentFenRef.current();
    const [uci1, uci2] = pvMoves.split(' ');
    if (!uci1 || uci1.length < 4) return;

    const fen1 = applyMove(baseFen, uci1);
    if (!fen1) return;

    boardRef.current?.move({
      from:      uci1.slice(0, 2) as Square,
      to:        uci1.slice(2, 4) as Square,
      promotion: uci1.length === 5 ? uci1[4] as PieceSymbol : undefined,
    });

    if (uci2 && uci2.length >= 4) {
      const fen2 = applyMove(fen1, uci2);
      if (fen2) {
        setTimeout(() => {
          boardRef.current?.move({
            from:      uci2.slice(0, 2) as Square,
            to:        uci2.slice(2, 4) as Square,
            promotion: uci2.length === 5 ? uci2[4] as PieceSymbol : undefined,
          });
          setExplorationFen(fen2);
          runAnalysis(fen2);
        }, 450);
        return;
      }
    }

    // Solo 1 movimiento disponible (fin de partida o PV corto)
    setExplorationFen(fen1);
    runAnalysis(fen1);
  }, [analyzedFen, runAnalysis]);

  // Hint: level 3 auto-move — PuzzleCard animates board then runs solver
  const handleHint = useCallback(() => {
    const autoMoveUCI = requestHint();
    if (autoMoveUCI && autoMoveUCI.length >= 4) {
      boardRef.current?.move({
        from:      autoMoveUCI.slice(0, 2) as Square,
        to:        autoMoveUCI.slice(2, 4) as Square,
        promotion: autoMoveUCI.length === 5 ? autoMoveUCI[4] as PieceSymbol : undefined,
      });
      onUserMove(autoMoveUCI);
    }
  }, [requestHint, onUserMove]);

  const hintLabel = hintLevel === 0 ? t('puzzle.hint')
                  : hintLevel === 1 ? t('puzzle.hintMore')
                  : t('puzzle.hintShow');

  // Arrow for the active move in review mode (orange, matches existing square highlights)
  const reviewArrow = useMemo<BoardArrow | null>(() => {
    if (puzzleStatus !== 'reviewing' && puzzleStatus !== 'reviewed') return null;
    if (reviewMoveIndex <= 0) return null;
    const uci = puzzle.moves[reviewMoveIndex - 1];
    if (!uci || uci.length < 4) return null;
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), color: 'rgba(255,165,0,0.75)' };
  }, [puzzleStatus, reviewMoveIndex, puzzle.moves]);

  // Merge: hint (yellow) + review (orange) + analysis (green)
  const allArrows = useMemo<BoardArrow[]>(() => {
    const hint:   BoardArrow[] = hintFromTo ? [{ from: hintFromTo.from, to: hintFromTo.to, color: 'rgba(255,215,0,0.85)' }] : [];
    const review: BoardArrow[] = reviewArrow ? [reviewArrow] : [];
    return [...hint, ...review, ...analysisArrows];
  }, [hintFromTo, reviewArrow, analysisArrows]);

  // S1: board enabled logic
  const boardEnabled = isActive && (
    puzzleStatus === 'playing' ||
    (isAnalysisOpen && !vsEngineWaiting && !vsEngineOver) ||
    puzzleStatus === 'reviewing' ||
    puzzleStatus === 'reviewed'
  );

  // S3: board size — desktop uses original calc, mobile uses flex-measured container
  const boardMaxSizeDesktop = Math.min(height - 40, 580, boardColW > 0 ? boardColW : height - 40);
  const boardMaxSizeMobile  = boardSectionSize > 0 ? boardSectionSize : Math.max(height - 248, 200);

  // ── Shared sub-elements ───────────────────────────────────────────────────
  const badgeRow = !isCalibrating ? (
    <View style={styles.topRow}>
      <RangeBadge elo={elo} />
      {sessionCount > 0 && (
        <Text style={[styles.sessionCount, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
          {t('puzzle.sessionCount', { count: sessionCount })}
        </Text>
      )}
    </View>
  ) : (
    <View style={[styles.calibBar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
      <Text style={[styles.calibText, { color: colors.accent, fontSize: typography.size.xs }]}>
        {t('calibration.estimating')}
      </Text>
      <CalibrationBar
        startLow={preEloStartLow}
        startHigh={preEloStartHigh}
        currentLow={preEloLow!}
        currentHigh={preEloHigh!}
      />
    </View>
  );

  const hasBeenPlayed = ['failed', 'reviewing', 'reviewed', 'complete'].includes(puzzleStatus);

  const metaText = hasBeenPlayed ? (
    <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
      {t('puzzle.ratingMeta', { rating: puzzle.rating, theme: t(`tactic.${puzzle.themes[0]}`) })}
    </Text>
  ) : null;

  const playerColorText = (
    <Text style={[styles.playerColor, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
      {t(playerColor === 'white' ? 'puzzle.playingWhite' : 'puzzle.playingBlack')}
    </Text>
  );

  const statusText = (
    <Text style={[styles.status, { color: statusColor, fontSize: typography.size.md }]}>
      {statusLabels[puzzleStatus]}
    </Text>
  );

  // ── Analysis inline panel ─────────────────────────────────────────────────
  const analysisPanel = isAnalysisOpen ? (
    <View style={[styles.analysisPanel, { backgroundColor: colors.background, borderColor: colors.border }]}>

      {/* ── vs-engine mode ── */}
      {isVsEngine ? (
        <>
          <View style={styles.analysisHeader}>
            <Text style={[styles.analysisTitle, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {t('vsEngine.title')}
            </Text>
            <TouchableOpacity onPress={handleExitVsEngine} hitSlop={8}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.size.sm }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.vsEngineStatus}>
            {vsEngineOver ? (
              <Text style={[styles.vsEngineStatusText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                {t('vsEngine.gameOver')}
              </Text>
            ) : vsEngineWaiting ? (
              <>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[styles.vsEngineStatusText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                  {t('vsEngine.thinking')}
                </Text>
              </>
            ) : (
              <Text style={[styles.vsEngineStatusText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                {t('vsEngine.yourTurn')}
              </Text>
            )}
          </View>
        </>
      ) : (
        /* ── normal analysis mode ── */
        <>
          <View style={styles.analysisHeader}>
            <Text style={[styles.analysisTitle, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {analysisState.status === 'loading'  && t('analysis.loading')}
              {analysisState.status === 'thinking' && t('analysis.depth', { depth: analysisState.depth })}
              {analysisState.status === 'ready'    && t('analysis.depth', { depth: analysisState.result.depth })}
              {analysisState.status === 'error'    && t('analysis.unavailable')}
            </Text>
            <View style={styles.analysisHeaderActions}>
              {explorationFen !== null && (
                <TouchableOpacity
                  onPress={handleBackToMainLine}
                  hitSlop={8}
                  style={[styles.mainLineBtn, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: typography.size.xs }}>
                    ← {t('puzzle.mainLine')}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleResetAnalysis} hitSlop={8}>
                <Text style={{ color: colors.textSecondary, fontSize: typography.size.sm }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {analysisState.status === 'loading' && (
            <ActivityIndicator size="small" color={colors.accent} style={{ alignSelf: 'flex-start' }} />
          )}

          {(analysisState.status === 'thinking' || analysisState.status === 'ready') && (() => {
            const pvs     = analysisState.status === 'ready' ? analysisState.result.pvs : analysisState.pvs;
            const topCp   = pvs[0]?.cp   ?? null;
            const topMate = pvs[0]?.mate  ?? null;
            return (
              <View style={styles.analysisBody}>
                <EvalBar cp={topCp} mate={topMate} />
                <View style={{ flex: 1, gap: 4 }}>
                  {pvs.slice(0, 3).map((pv, i) => {
                    const evalStr = pv.mate != null
                      ? (pv.mate > 0 ? `M${pv.mate}` : `M${-pv.mate}`)
                      : pv.cp != null
                        ? `${pv.cp > 0 ? '+' : ''}${(pv.cp / 100).toFixed(1)}`
                        : '=';
                    const moves     = pv.moves?.split(' ') ?? [];
                    const moveLabel = moves.slice(0, 2).join(' ') || '—';
                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.pvRow}
                        activeOpacity={0.5}
                        onPress={() => pv.moves && handlePvClick(pv.moves)}
                      >
                        <Text style={[styles.pvEval, { color: colors.text, fontSize: typography.size.xs }]}>{evalStr}</Text>
                        <Text style={[styles.pvMoves, { color: colors.textSecondary, fontSize: typography.size.xs }]} numberOfLines={1}>
                          {moveLabel}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: typography.size.xs, opacity: 0.5 }}>›</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {/* "Play from here" — enters vs-engine mode */}
                  <TouchableOpacity
                    style={[styles.vsEngineBtn, { borderColor: colors.border }]}
                    onPress={handleStartVsEngine}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: typography.size.xs }}>
                      ⚔ {t('vsEngine.play')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </>
      )}
    </View>
  ) : null;

  // ── Review navigation row ─────────────────────────────────────────────────
  const reviewNav = (puzzleStatus: 'reviewing' | 'reviewed') => (
    <View style={styles.reviewNav}>
      <TouchableOpacity
        style={[styles.navBtn, { opacity: reviewMoveIndex <= 0 ? 0.25 : 1 }]}
        onPress={() => { stopAutoplay(); wrappedBackReview(); }}
        disabled={reviewMoveIndex <= 0}
      >
        <Text style={[styles.navBtnText, { color: colors.text }]}>‹</Text>
      </TouchableOpacity>

      <View style={styles.reviewInfo}>
        <Text style={[styles.reviewSanText, { color: colors.text, fontSize: typography.size.sm }]} numberOfLines={1}>
          {reviewSan ?? '—'}
        </Text>
        <Text style={[styles.reviewCounter, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
          {reviewMoveIndex}/{puzzle.moves.length}
        </Text>
      </View>

      {/* Autoplay button — only in reviewing, not at the end */}
      {puzzleStatus === 'reviewing' && (
        <TouchableOpacity
          style={styles.navBtn}
          onPress={isAutoplaying ? stopAutoplay : startAutoplay}
        >
          <Text style={[styles.navBtnText, { color: colors.accent, fontSize: 22 }]}>
            {isAutoplaying ? '■' : '▶'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.navBtn, { opacity: reviewMoveIndex >= puzzle.moves.length ? 0.25 : 1 }]}
        onPress={() => { stopAutoplay(); wrappedAdvanceReview(); }}
        disabled={reviewMoveIndex >= puzzle.moves.length}
      >
        <Text style={[styles.navBtnText, { color: colors.text }]}>›</Text>
      </TouchableOpacity>
    </View>
  );

  // ── S2: Buttons per state ─────────────────────────────────────────────────
  const buttons = (
    <View style={styles.buttonsArea}>

      {/* playing: pista progresiva + válvula de escape */}
      {isActive && puzzleStatus === 'playing' && (
        <View style={styles.row}>
          {hintLevel < 3 && (
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={handleHint}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {hintLabel}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost, { flex: 1 }]}
            onPress={startReview}
          >
            <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
              {t('puzzle.viewSolution')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* failed: hierarchy — primary "Ver Solución" → secondary [Reintentar | Analizar] → ghost "Saltar" */}
      {isActive && puzzleStatus === 'failed' && (
        <>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent, alignSelf: 'stretch' }]}
            onPress={startReview}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.viewSolution')}
            </Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={onRetry}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.retry')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={handleAnalyze}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.analyze')}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onComplete}>
            <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
              {t('puzzle.skip')}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* reviewing: nav + [Analizar | Saltar ghost] */}
      {isActive && puzzleStatus === 'reviewing' && (
        <>
          {reviewNav(puzzleStatus as 'reviewing' | 'reviewed')}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={handleAnalyze}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.analyze')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhostOutline, { flex: 1 }]}
              onPress={onComplete}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {t('puzzle.skip')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* reviewed: nav + "Siguiente Puzzle" (primary wide) + "Analizar" */}
      {isActive && puzzleStatus === 'reviewed' && (
        <>
          {reviewNav(puzzleStatus as 'reviewing' | 'reviewed')}
          <TouchableOpacity
            style={[
              styles.btn, styles.btnPrimary, { alignSelf: 'stretch' },
              reviewedAfterSolve
                ? { backgroundColor: colors.success }
                : { backgroundColor: colors.accent },
            ]}
            onPress={onComplete}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.nextPuzzle')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, alignSelf: 'stretch' }]}
            onPress={handleAnalyze}
          >
            <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
              {t('puzzle.analyze')}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* complete: "Siguiente Puzzle" (primary wide) + secondary row */}
      {isActive && puzzleStatus === 'complete' && (
        <>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.success, alignSelf: 'stretch' }]}
            onPress={onComplete}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.nextPuzzle')}
            </Text>
          </TouchableOpacity>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={startReview}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.reviewMove')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={handleAnalyze}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.analyze')}
              </Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline, { borderColor: colors.border, opacity: isSharing ? 0.5 : 1 }]}
                onPress={captureAndShare}
                disabled={isSharing}
              >
                <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                  {isSharing ? '…' : t('puzzle.share')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* Analysis panel — shown below buttons in all states */}
      {analysisPanel}
    </View>
  );

  // ── Desktop: board-left / info-right ─────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={[styles.cardDesktop, { height, backgroundColor: backgroundColor ?? colors.background }]}>
        {/* Left: board */}
        <View
          style={styles.boardCol}
          onLayout={e => setBoardColW(e.nativeEvent.layout.width)}
        >
          <View style={styles.boardSection}>
            <View style={[styles.colorBar, { backgroundColor: opponentBarColor, width: boardMaxSizeDesktop, alignSelf: 'center' }]} />
            <View style={styles.boardWrapper}>
              <ChessBoard
                ref={boardRef}
                fen={puzzle.fen}
                resetKey={puzzle.id}
                orientation="auto"
                enabled={boardEnabled}
                onMove={handleBoardMove}
                maxSize={boardMaxSizeDesktop}
                arrows={allArrows.length ? allArrows : undefined}
              />
              {eloDelta !== null && (
                <EloDeltaBadge delta={eloDelta} onAnimationEnd={clearEloDelta} />
              )}
              {hasFailed && (puzzleStatus === 'idle' || puzzleStatus === 'playing') && (
                <View pointerEvents="none" style={[styles.retryBorder, { borderColor: colors.error }]} />
              )}
            </View>
            <View style={[styles.colorBar, { backgroundColor: playerBarColor, width: boardMaxSizeDesktop, alignSelf: 'center' }]} />
          </View>
        </View>

        {/* Right: info panel */}
        <View style={[styles.infoPanel, { borderLeftColor: colors.border }]}>
          {badgeRow}
          {metaText}
          {playerColorText}
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          {statusText}
          {buttons}
        </View>

        {isActive && puzzleStatus === 'complete' && Platform.OS !== 'web' && (
          <ShareCard
            ref={cardRef}
            tactic={puzzle.themes[0] ?? 'other'}
            puzzleRating={puzzle.rating}
            elo={elo}
            streakDays={streakDays}
            puzzlesCompleted={puzzlesCompleted}
          />
        )}
      </View>
    );
  }

  // ── Mobile: S3 flex layout — top / board(flex:1) / bottom ────────────────
  return (
    <View style={[styles.card, { height, backgroundColor: backgroundColor ?? colors.background }]}>

      {/* Top section: badge + meta + playerColor */}
      <View style={styles.topSection}>
        {badgeRow}
        {metaText}
        {playerColorText}
      </View>

      {/* Board section: flex:1 — absorbs all remaining space */}
      <View
        style={styles.boardSectionFlex}
        onLayout={e => {
          const { width, height: h } = e.nativeEvent.layout;
          setBoardSectionSize(Math.min(width, h));
        }}
      >
        <View style={[styles.colorBar, { backgroundColor: opponentBarColor, width: boardMaxSizeMobile, alignSelf: 'center' }]} />
        <View style={styles.boardWrapper}>
          <ChessBoard
            ref={boardRef}
            fen={puzzle.fen}
            resetKey={puzzle.id}
            orientation="auto"
            enabled={boardEnabled}
            onMove={handleBoardMove}
            maxSize={boardMaxSizeMobile}
            arrows={allArrows.length ? allArrows : undefined}
          />
          {eloDelta !== null && (
            <EloDeltaBadge delta={eloDelta} onAnimationEnd={clearEloDelta} />
          )}
          {hasFailed && (puzzleStatus === 'idle' || puzzleStatus === 'playing') && (
            <View pointerEvents="none" style={[styles.retryBorder, { borderColor: colors.error }]} />
          )}
        </View>
        <View style={[styles.colorBar, { backgroundColor: playerBarColor, width: boardMaxSizeMobile, alignSelf: 'center' }]} />
      </View>

      {/* Bottom section: status + buttons */}
      <View style={styles.bottomSection}>
        {statusText}
        {buttons}
      </View>

      {isActive && puzzleStatus === 'complete' && Platform.OS !== 'web' && (
        <ShareCard
          ref={cardRef}
          tactic={puzzle.themes[0] ?? 'other'}
          puzzleRating={puzzle.rating}
          elo={elo}
          streakDays={streakDays}
          puzzlesCompleted={puzzlesCompleted}
        />
      )}
    </View>
  );
}

export const PuzzleCard = memo(PuzzleCardComponent);

const styles = StyleSheet.create({
  // ── Mobile card ──────────────────────────────────────────────────────────
  card:             { alignItems: 'center', paddingVertical: 8 },
  topSection:       { alignSelf: 'stretch', alignItems: 'center', paddingBottom: 4, gap: 2 },
  boardSectionFlex: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  bottomSection:    { alignSelf: 'stretch', alignItems: 'center', paddingTop: 6, gap: 8 },

  // ── Desktop card ─────────────────────────────────────────────────────────
  cardDesktop:  { flexDirection: 'row', alignItems: 'stretch' },
  boardCol:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  infoPanel:    {
    width: DESKTOP_PANEL_WIDTH,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 14,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  separator:    { height: StyleSheet.hairlineWidth, marginVertical: 4 },

  // ── Shared ───────────────────────────────────────────────────────────────
  topRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionCount:   { fontWeight: '600' },
  calibBar:       { width: '88%', borderRadius: 8, borderWidth: 1, padding: 10, gap: 8 },
  calibText:      { fontWeight: '600', textAlign: 'center' },
  boardSection:   { alignSelf: 'stretch', alignItems: 'center' },
  colorBar:       { height: 4, alignSelf: 'stretch' },
  boardWrapper:   { position: 'relative' },
  retryBorder:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 4 },
  meta:           { marginBottom: 2 },
  playerColor:    { marginBottom: 2, fontWeight: '600' },
  status:         { fontWeight: '500' },

  // ── Buttons area ─────────────────────────────────────────────────────────
  buttonsArea:    { alignSelf: 'stretch', gap: 8 },
  row:            { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  btn:            { paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  btnPrimary:     { paddingVertical: 12 },
  btnGhost:       { alignSelf: 'stretch', opacity: 0.6 },
  btnGhostOutline: { opacity: 0.5, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  btnOutline:     { borderWidth: 1 },
  btnText:        { fontWeight: '600' },

  // ── Review nav ───────────────────────────────────────────────────────────
  reviewNav:      { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', gap: 20 },
  navBtn:         { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navBtnText:     { fontSize: 30, fontWeight: '300', lineHeight: 36 },
  reviewInfo:     { alignItems: 'center', minWidth: 64 },
  reviewSanText:  { fontFamily: 'monospace' as const, fontWeight: '700', textAlign: 'center' },
  reviewCounter:  { textAlign: 'center', fontWeight: '500' },

  // ── Analysis inline panel ────────────────────────────────────────────────
  analysisPanel:        { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 10, gap: 8 },
  analysisHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  analysisHeaderActions:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  analysisTitle:        { fontWeight: '600', flex: 1 },
  mainLineBtn:          { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  analysisBody:         { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 60 },
  pvRow:                { flexDirection: 'row', gap: 6, alignItems: 'center' },
  pvEval:               { fontWeight: '700', minWidth: 36 },
  pvMoves:              { flex: 1, fontFamily: 'monospace' as const, opacity: 0.7 },
  vsEngineStatus:       { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  vsEngineStatusText:   { fontWeight: '500' },
  vsEngineBtn:          { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4, alignSelf: 'flex-start' },
});
