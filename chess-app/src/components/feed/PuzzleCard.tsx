import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

const STATUS_LABEL: Record<SolverStatus, string> = {
  idle:      'Cargando…',
  playing:   'Tu turno',
  failed:    '✗ Incorrecto',
  reviewing: 'Revisando solución…',
  complete:  '✓ ¡Puzzle resuelto!',
};

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

export function PuzzleCard({ puzzle, height, isActive, onComplete, onStatusChange }: Props) {
  const { colors, typography, spacing } = useTheme();
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

  // Notify parent of status changes so the feed can coordinate scroll/auto-advance
  useEffect(() => {
    if (isActive) onStatusChange?.(puzzleStatus);
  }, [puzzleStatus, isActive, onStatusChange]);

  const statusColor = colors[STATUS_COLOR[puzzleStatus]];

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      {isCalibrated ? (
        <RangeBadge elo={elo} />
      ) : (
        <View style={[styles.calibBar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[styles.calibText, { color: colors.accent, fontSize: typography.size.xs }]}>
            Calibrando tu nivel · {calibrationCount}/{CALIBRATION_PUZZLES}
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
        Rating {puzzle.rating} · {puzzle.themes[0]}
      </Text>

      <ChessBoard
        ref={boardRef}
        fen={puzzle.fen}
        orientation="auto"
        enabled={puzzleStatus === 'playing' && isActive}
        onMove={onUserMove}
      />

      <Text style={[styles.status, { color: statusColor, fontSize: typography.size.md }]}>
        {STATUS_LABEL[puzzleStatus]}
      </Text>

      {puzzleStatus === 'failed' && (
        <View style={[styles.row, { gap: spacing[2] }]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, borderRadius: 8 }]}
            onPress={onRetry}
          >
            <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.sm }]}>
              Reintentar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.accent, borderRadius: 8 }]}
            onPress={startReview}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              Ver solución
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
            Siguiente movimiento
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
                {isSharing ? '…' : 'Compartir'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.success, borderRadius: 8 }]}
            onPress={onComplete}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
              Siguiente puzzle
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Off-screen card captured by useShareCard */}
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
