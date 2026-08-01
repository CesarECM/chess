import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import { useTheme } from '@/hooks/useTheme';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { usePuzzleSolverLocal, type SolverStatus } from '@/hooks/usePuzzleSolverLocal';
import { useShareCard } from '@/hooks/useShareCard';
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
  onAnalyze?: (fen: string) => void;
  boardArrow?: { from: string; to: string } | null;
  onForceFailRef?: MutableRefObject<(() => void) | null>;
  onDebugLog?: (tag: string, msg: string) => void;
}

function PuzzleCardComponent({
  puzzle, height, isActive, feedIndex,
  onComplete, onStatusChange, onMessagesEarned, backgroundColor, onAnalyze, boardArrow, onForceFailRef, onDebugLog,
}: Props) {
  const { colors, typography } = useTheme();
  const { t }        = useTranslation();
  const isDesktop    = useIsDesktop();
  const boardRef     = useRef<ChessboardRef>(null);
  const [boardColW, setBoardColW] = useState(0);

  const elo              = useUserStore((s) => s.elo);
  const preEloLow        = useUserStore((s) => s.preEloLow);
  const preEloHigh       = useUserStore((s) => s.preEloHigh);
  const preEloStartLow   = useUserStore((s) => s.preEloStartLow);
  const preEloStartHigh  = useUserStore((s) => s.preEloStartHigh);
  const streakDays       = useUserStore((s) => s.streakDays);
  const puzzlesCompleted = useUserStore((s) => s.puzzlesCompleted);
  const sessionCount     = usePuzzleStore((s) => s.sessionPuzzleCount);

  const { cardRef, isSharing, captureAndShare } = useShareCard();

  const handleMessagesEarned = useCallback(
    (msgs: ProgressMessage[]) => onMessagesEarned?.(msgs, feedIndex),
    [feedIndex, onMessagesEarned],
  );

  const {
    puzzleStatus, hasFailed, reviewMoveIndex, reviewedAfterSolve,
    onUserMove, startReview, handleAdvanceReview, handleBackReview, onRetry,
    forceFailure, eloDelta, clearEloDelta, getCurrentFen,
  } = usePuzzleSolverLocal(puzzle, boardRef, isActive, handleMessagesEarned);

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

  // Board size: on desktop, height-limited and column-width-limited; on mobile, height-limited.
  const boardMaxSize = isDesktop
    ? Math.min(
        height - 40,
        580,
        boardColW > 0 ? boardColW : height - 40,
      )
    : (Platform.OS === 'web' ? Math.max(height - 248, 200) : undefined);

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

  const buttons = (
    <View style={styles.buttonsArea}>
      {/* playing: válvula de escape ghost */}
      {isActive && puzzleStatus === 'playing' && (
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={startReview}>
          <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
            {t('puzzle.viewSolution')}
          </Text>
        </TouchableOpacity>
      )}

      {/* failed: reintentar / ver solución + analizar / saltar */}
      {isActive && puzzleStatus === 'failed' && (
        <>
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
              style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent, flex: 1 }]}
              onPress={startReview}
            >
              <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
                {t('puzzle.viewSolution')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={() => onAnalyze?.(getCurrentFen())}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.analyze')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
              onPress={onComplete}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {t('puzzle.skip')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* reviewing / reviewed: navegación ‹ N/M › */}
      {isActive && (puzzleStatus === 'reviewing' || puzzleStatus === 'reviewed') && (
        <View style={styles.reviewNav}>
          <TouchableOpacity
            style={[styles.navBtn, { opacity: reviewMoveIndex <= 0 ? 0.25 : 1 }]}
            onPress={handleBackReview}
            disabled={reviewMoveIndex <= 0}
          >
            <Text style={[styles.navBtnText, { color: colors.text }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.reviewCounter, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {reviewMoveIndex} / {puzzle.moves.length}
          </Text>
          <TouchableOpacity
            style={[styles.navBtn, { opacity: reviewMoveIndex >= puzzle.moves.length ? 0.25 : 1 }]}
            onPress={handleAdvanceReview}
            disabled={reviewMoveIndex >= puzzle.moves.length}
          >
            <Text style={[styles.navBtnText, { color: colors.text }]}>›</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* reviewing / reviewed: analizar + siguiente (primario en reviewed) */}
      {isActive && (puzzleStatus === 'reviewing' || puzzleStatus === 'reviewed') && (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, flex: 1 }]}
            onPress={() => onAnalyze?.(getCurrentFen())}
          >
            <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
              {t('puzzle.analyze')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btn,
              { flex: 1 },
              puzzleStatus === 'reviewed'
                ? [styles.btnPrimary, { backgroundColor: colors.accent }]
                : [styles.btnOutline, { borderColor: colors.border }],
            ]}
            onPress={onComplete}
          >
            <Text style={[styles.btnText, {
              color: puzzleStatus === 'reviewed' ? '#fff' : colors.text,
              fontSize: typography.size.sm,
            }]}>
              {t('puzzle.nextPuzzle')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* complete: revisar / analizar + compartir / siguiente */}
      {isActive && puzzleStatus === 'complete' && (
        <>
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
              onPress={() => onAnalyze?.(getCurrentFen())}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('puzzle.analyze')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.row}>
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
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.success, flex: 1 }]}
              onPress={onComplete}
            >
              <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
                {t('puzzle.nextPuzzle')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
            <View style={[styles.colorBar, { backgroundColor: opponentBarColor, width: boardMaxSize, alignSelf: 'center' }]} />
            <View style={styles.boardWrapper}>
              <ChessBoard
                ref={boardRef}
                fen={puzzle.fen}
                resetKey={puzzle.id}
                orientation="auto"
                enabled={puzzleStatus === 'playing' && isActive}
                onMove={onUserMove}
                maxSize={boardMaxSize}
                arrows={boardArrow ? [{ ...boardArrow, color: 'rgba(50,200,50,0.85)' }] : undefined}
              />
              {eloDelta !== null && (
                <EloDeltaBadge delta={eloDelta} onAnimationEnd={clearEloDelta} />
              )}
              {hasFailed && (puzzleStatus === 'idle' || puzzleStatus === 'playing') && (
                <View pointerEvents="none" style={[styles.retryBorder, { borderColor: colors.error }]} />
              )}
            </View>
            <View style={[styles.colorBar, { backgroundColor: playerBarColor, width: boardMaxSize, alignSelf: 'center' }]} />
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

  // ── Mobile: stacked vertical ──────────────────────────────────────────────
  return (
    <View style={[styles.card, { height, backgroundColor: backgroundColor ?? colors.background }]}>
      {badgeRow}
      {metaText}
      {playerColorText}

      <View style={styles.boardSection}>
        <View style={[styles.colorBar, { backgroundColor: opponentBarColor }]} />
        <View style={styles.boardWrapper}>
          <ChessBoard
            ref={boardRef}
            fen={puzzle.fen}
            resetKey={puzzle.id}
            orientation="auto"
            enabled={puzzleStatus === 'playing' && isActive}
            onMove={onUserMove}
            maxSize={boardMaxSize}
            arrows={boardArrow ? [{ ...boardArrow, color: 'rgba(50,200,50,0.85)' }] : undefined}
          />
          {eloDelta !== null && (
            <EloDeltaBadge delta={eloDelta} onAnimationEnd={clearEloDelta} />
          )}
          {hasFailed && (puzzleStatus === 'idle' || puzzleStatus === 'playing') && (
            <View pointerEvents="none" style={[styles.retryBorder, { borderColor: colors.error }]} />
          )}
        </View>
        <View style={[styles.colorBar, { backgroundColor: playerBarColor }]} />
      </View>

      {statusText}
      {buttons}

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
  // Mobile
  card:         { alignItems: 'center', justifyContent: 'center', gap: 12 },
  // Desktop
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
  // Shared
  topRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionCount: { fontWeight: '600' },
  calibBar:     { width: '88%', borderRadius: 8, borderWidth: 1, padding: 10, gap: 8 },
  calibText:    { fontWeight: '600', textAlign: 'center' },
  boardSection: { alignSelf: 'stretch', alignItems: 'center' },
  colorBar:     { height: 4, alignSelf: 'stretch' },
  boardWrapper: { position: 'relative' },
  retryBorder:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderRadius: 4 },
  meta:         { marginBottom: 2 },
  playerColor:  { marginBottom: 6, fontWeight: '600' },
  status:       { fontWeight: '500' },
  // Buttons area
  buttonsArea:  { alignSelf: 'stretch', gap: 8 },
  row:          { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  btn:          { paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  btnPrimary:   { paddingVertical: 12 },
  btnGhost:     { alignSelf: 'stretch', opacity: 0.4 },
  btnOutline:   { borderWidth: 1 },
  btnText:      { fontWeight: '600' },
  reviewNav:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', gap: 20 },
  navBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navBtnText:   { fontSize: 30, fontWeight: '300', lineHeight: 36 },
  reviewCounter: { minWidth: 52, textAlign: 'center', fontWeight: '600' },
});
