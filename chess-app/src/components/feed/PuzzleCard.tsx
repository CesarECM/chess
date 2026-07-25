import { memo, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';
import { usePuzzleSolverLocal, type SolverStatus } from '@/hooks/usePuzzleSolverLocal';
import { useShareCard } from '@/hooks/useShareCard';
import { RangeBadge } from '@/components/ui/RangeBadge';
import { ShareCard } from '@/components/ui/ShareCard';
import { CALIBRATION_PUZZLES } from '@/constants';
import type { Puzzle } from '@/types';

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
  onComplete: () => void;
  onStatusChange?: (status: SolverStatus) => void;
}

function PuzzleCardComponent({ puzzle, height, isActive, onComplete, onStatusChange }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();
  const boardRef = useRef<ChessboardRef>(null);
  const elo             = useUserStore((s) => s.elo);
  const streakDays      = useUserStore((s) => s.streakDays);
  const puzzlesCompleted = useUserStore((s) => s.puzzlesCompleted);

  const { cardRef, isSharing, captureAndShare } = useShareCard();

  const {
    puzzleStatus,
    onUserMove,
    startReview,
    handleAdvanceReview,
    onRetry,
    isCalibrated,
    calibrationCount,
  } = usePuzzleSolverLocal(puzzle, boardRef, isActive);

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

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      {isCalibrated ? (
        <RangeBadge elo={elo} />
      ) : (
        <View style={[styles.calibBar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[styles.calibText, { color: colors.accent, fontSize: typography.size.xs }]}>
            {t('puzzle.calibrating', { count: calibrationCount, total: CALIBRATION_PUZZLES })}
          </Text>
          <View style={[styles.calibTrack, { backgroundColor: colors.accent + '33' }]}>
            <View
              style={[
                styles.calibFill,
                {
                  backgroundColor: colors.accent,
                  width: `${(calibrationCount / CALIBRATION_PUZZLES) * 100}%` as `${number}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('puzzle.ratingMeta', { rating: puzzle.rating, theme: puzzle.themes[0] })}
      </Text>

      <ChessBoard
        ref={boardRef}
        fen={puzzle.fen}
        orientation="auto"
        enabled={puzzleStatus === 'playing' && isActive}
        onMove={onUserMove}
      />

      <Text style={[styles.status, { color: statusColor, fontSize: typography.size.md }]}>
        {statusLabels[puzzleStatus]}
      </Text>

      {puzzleStatus === 'failed' && (
        <View style={[styles.row, { gap: spacing[2] }]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, borderRadius: 8 }]}
            onPress={onRetry}
          >
            <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
              {t('puzzle.retry')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 8 }]}
            onPress={startReview}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.viewSolution')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {puzzleStatus === 'reviewing' && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 8 }]}
          onPress={handleAdvanceReview}
        >
          <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
            {t('puzzle.nextMove')}
          </Text>
        </TouchableOpacity>
      )}

      {puzzleStatus === 'complete' && (
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
            style={[styles.btn, { backgroundColor: colors.success, borderRadius: 8 }]}
            onPress={onComplete}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              {t('puzzle.nextPuzzle')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {puzzleStatus === 'complete' && Platform.OS !== 'web' && (
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
  card:       { alignItems: 'center', justifyContent: 'center', gap: 12 },
  calibBar:   { width: '88%', borderRadius: 8, borderWidth: 1, padding: 10, gap: 6 },
  calibText:  { fontWeight: '600', textAlign: 'center' },
  calibTrack: { height: 4, borderRadius: 2, width: '100%', overflow: 'hidden' },
  calibFill:  { height: 4, borderRadius: 2 },
  meta:       { marginBottom: 4 },
  status:     { marginTop: 12, fontWeight: '500' },
  row:        { flexDirection: 'row' },
  btn:        { paddingHorizontal: 20, paddingVertical: 10 },
  btnOutline: { borderWidth: 1 },
  btnText:    { fontWeight: '600' },
});
