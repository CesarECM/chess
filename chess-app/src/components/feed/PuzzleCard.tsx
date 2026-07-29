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
import { RangeBadge } from '@/components/ui/RangeBadge';
import { ShareCard } from '@/components/ui/ShareCard';
import { CALIBRATION_PUZZLES } from '@/constants';
import type { Puzzle, ProgressMessage } from '@/types';

const DESKTOP_PANEL_WIDTH = 280;

const STATUS_COLOR: Record<SolverStatus, keyof ReturnType<typeof useTheme>['colors']> = {
  idle:      'textSecondary',
  playing:   'textSecondary',
  failed:    'error',
  reviewing: 'textSecondary',
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
  const { colors, typography, spacing } = useTheme();
  const { t }        = useTranslation();
  const isDesktop    = useIsDesktop();
  const boardRef     = useRef<ChessboardRef>(null);
  const [boardColW, setBoardColW] = useState(0);

  const elo              = useUserStore((s) => s.elo);
  const streakDays       = useUserStore((s) => s.streakDays);
  const puzzlesCompleted = useUserStore((s) => s.puzzlesCompleted);
  const sessionCount     = usePuzzleStore((s) => s.sessionPuzzleCount);

  const { cardRef, isSharing, captureAndShare } = useShareCard();

  const handleMessagesEarned = useCallback(
    (msgs: ProgressMessage[]) => onMessagesEarned?.(msgs, feedIndex),
    [feedIndex, onMessagesEarned],
  );

  const {
    puzzleStatus, onUserMove, startReview, handleAdvanceReview, onRetry,
    forceFailure, isCalibrated, calibrationCount, eloDelta, clearEloDelta,
  } = usePuzzleSolverLocal(puzzle, boardRef, isActive, handleMessagesEarned);

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

  const playerColor = puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white';

  useEffect(() => {
    if (isActive) onStatusChange?.(puzzleStatus);
  }, [puzzleStatus, isActive, onStatusChange]);

  const statusColor = colors[STATUS_COLOR[puzzleStatus]];

  const statusLabels = useMemo<Record<SolverStatus, string>>(() => ({
    idle:      t('puzzle.statusIdle'),
    playing:   t('puzzle.statusPlaying'),
    failed:    t('puzzle.statusFailed'),
    reviewing: t('puzzle.statusReviewing'),
    complete:  t('puzzle.statusComplete'),
  }), [t]);

  // Board size: on desktop, height-limited and column-width-limited; on mobile, height-limited.
  const boardMaxSize = isDesktop
    ? Math.min(
        height - 40,
        580,
        boardColW > 0 ? boardColW : height - 40,
      )
    : (Platform.OS === 'web' ? Math.max(height - 220, 200) : undefined);

  // ── Shared sub-elements ───────────────────────────────────────────────────
  const badgeRow = isCalibrated ? (
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
        {t('puzzle.calibrating', { count: calibrationCount, total: CALIBRATION_PUZZLES })}
      </Text>
      <View style={[styles.calibTrack, { backgroundColor: colors.accent + '33' }]}>
        <View
          style={[styles.calibFill, {
            backgroundColor: colors.accent,
            width: `${(calibrationCount / CALIBRATION_PUZZLES) * 100}%` as `${number}%`,
          }]}
        />
      </View>
    </View>
  );

  const metaText = (
    <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
      {t('puzzle.ratingMeta', { rating: puzzle.rating, theme: puzzle.themes[0] })}
    </Text>
  );

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
    <>
      {isActive && puzzleStatus === 'failed' && (
        <View style={[styles.row, { gap: spacing[2] }]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, borderRadius: 8, flex: 1 }]}
            onPress={onRetry}
          >
            <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
              {t('puzzle.retry')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 8, flex: 1 }]}
            onPress={startReview}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.viewSolution')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {isActive && puzzleStatus === 'reviewing' && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 8, alignSelf: 'stretch' }]}
          onPress={handleAdvanceReview}
        >
          <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
            {t('puzzle.nextMove')}
          </Text>
        </TouchableOpacity>
      )}
      {isActive && puzzleStatus === 'complete' && (
        <View style={[styles.row, { gap: spacing[2] }]}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border, borderRadius: 8, opacity: isSharing ? 0.5 : 1 }]}
              onPress={captureAndShare}
              disabled={isSharing}
            >
              <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
                {isSharing ? '…' : t('puzzle.share')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.success, borderRadius: 8, flex: 1 }]}
            onPress={onComplete}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.nextPuzzle')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
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
          <View style={styles.boardWrapper}>
            <ChessBoard
              ref={boardRef}
              fen={puzzle.fen}
              resetKey={puzzle.id}
              orientation="auto"
              enabled={puzzleStatus === 'playing' && isActive}
              onMove={onUserMove}
              maxSize={boardMaxSize}
            />
            {eloDelta !== null && (
              <EloDeltaBadge delta={eloDelta} onAnimationEnd={clearEloDelta} />
            )}
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

      <View style={styles.boardWrapper}>
        <ChessBoard
          ref={boardRef}
          fen={puzzle.fen}
          resetKey={puzzle.id}
          orientation="auto"
          enabled={puzzleStatus === 'playing' && isActive}
          onMove={onUserMove}
          maxSize={boardMaxSize}
        />
        {eloDelta !== null && (
          <EloDeltaBadge delta={eloDelta} onAnimationEnd={clearEloDelta} />
        )}
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
  calibBar:     { width: '88%', borderRadius: 8, borderWidth: 1, padding: 10, gap: 6 },
  calibText:    { fontWeight: '600', textAlign: 'center' },
  calibTrack:   { height: 4, borderRadius: 2, width: '100%', overflow: 'hidden' },
  calibFill:    { height: 4, borderRadius: 2 },
  boardWrapper: { position: 'relative' },
  meta:         { marginBottom: 2 },
  playerColor:  { marginBottom: 6, fontWeight: '600' },
  status:       { marginTop: 12, fontWeight: '500' },
  row:          { flexDirection: 'row', alignSelf: 'stretch' },
  btn:          { paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' },
  btnOutline:   { borderWidth: 1 },
  btnText:      { fontWeight: '600' },
});
