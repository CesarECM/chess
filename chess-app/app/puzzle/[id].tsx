import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import { useTheme } from '@/hooks/useTheme';
import { usePuzzleSolver } from '@/hooks/usePuzzleSolver';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { useUserStore } from '@/stores/useUserStore';
import { fetchPuzzleById, fetchFirstPuzzle } from '@/services/puzzles';
import { fetchNextPuzzle } from '@/services/reviewQueue';
import { getOrCreateGuestId } from '@/services/identity';
import { CALIBRATION_PUZZLES } from '@/constants';
import { RangeBadge } from '@/components/ui/RangeBadge';

const STATUS_LABEL: Record<string, string> = {
  idle:      'Cargando…',
  playing:   'Tu turno',
  failed:    '✗ Incorrecto',
  reviewing: 'Revisando solución…',
  complete:  '✓ ¡Puzzle resuelto!',
};

const STATUS_COLOR: Record<string, keyof ReturnType<typeof useTheme>['colors']> = {
  idle:      'textSecondary',
  playing:   'textSecondary',
  failed:    'error',
  reviewing: 'textSecondary',
  complete:  'success',
};

export default function PuzzleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, typography, spacing } = useTheme();
  const boardRef    = useRef<ChessboardRef>(null);
  const startPuzzle = usePuzzleStore((s) => s.startPuzzle);
  const resetSolver = usePuzzleStore((s) => s.resetSolver);
  const currentPuzzle = usePuzzleStore((s) => s.currentPuzzle);
  const [loadingNext, setLoadingNext] = useState(false);
  const elo = useUserStore((s) => s.elo);

  const {
    puzzleStatus,
    onUserMove,
    startReview,
    handleAdvanceReview,
    isCalibrated,
    calibrationCount,
  } = usePuzzleSolver(boardRef);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const puzzle = id
        ? (await fetchPuzzleById(id)) ?? (await fetchFirstPuzzle())
        : await fetchFirstPuzzle();
      if (!cancelled && puzzle) startPuzzle(puzzle);
    }
    load();
    return () => { cancelled = true; resetSolver(); };
  }, [id]);

  const handleNextPuzzle = async () => {
    setLoadingNext(true);
    const userId = await getOrCreateGuestId();
    const next   = await fetchNextPuzzle(userId, elo, currentPuzzle?.id);
    setLoadingNext(false);
    if (next) startPuzzle(next);
  };

  const statusLabel    = STATUS_LABEL[puzzleStatus] ?? '';
  const statusColorKey = STATUS_COLOR[puzzleStatus] ?? 'textSecondary';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Rank badge — visible once calibrated */}
      {isCalibrated && <RangeBadge elo={elo} />}

      {/* Calibration banner */}
      {!isCalibrated && (
        <View style={[styles.calibrationBar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[styles.calibrationText, { color: colors.accent, fontSize: typography.size.xs }]}>
            Calibrando tu nivel · {calibrationCount}/{CALIBRATION_PUZZLES}
          </Text>
          <View style={[styles.calibrationTrack, { backgroundColor: colors.accent + '33' }]}>
            <View
              style={[
                styles.calibrationFill,
                {
                  backgroundColor: colors.accent,
                  width: `${(calibrationCount / CALIBRATION_PUZZLES) * 100}%` as `${number}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Puzzle meta */}
      {currentPuzzle && (
        <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
          Rating {currentPuzzle.rating} · {currentPuzzle.themes[0]}
        </Text>
      )}

      {/* Board */}
      <ChessBoard
        ref={boardRef}
        fen={currentPuzzle?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
        orientation="auto"
        enabled={puzzleStatus === 'playing'}
        onMove={(uci) => onUserMove(uci)}
      />

      {/* Status */}
      <Text style={[styles.status, { color: colors[statusColorKey], fontSize: typography.size.md }]}>
        {statusLabel}
      </Text>

      {/* Failed: offer solution review or retry */}
      {puzzleStatus === 'failed' && (
        <View style={[styles.row, { gap: spacing[2] }]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, borderRadius: 8 }]}
            onPress={() => currentPuzzle && startPuzzle(currentPuzzle)}
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

      {/* Reviewing: advance through solution moves */}
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

      {/* Complete: proceed to next puzzle */}
      {puzzleStatus === 'complete' && (
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.success, borderRadius: 8 }]}
          onPress={handleNextPuzzle}
          disabled={loadingNext}
        >
          <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
            {loadingNext ? 'Cargando…' : 'Siguiente puzzle'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  calibrationBar:    { width: '88%', borderRadius: 8, borderWidth: 1, padding: 10, gap: 6 },
  calibrationText:   { fontWeight: '600', textAlign: 'center' },
  calibrationTrack:  { height: 4, borderRadius: 2, width: '100%', overflow: 'hidden' },
  calibrationFill:   { height: 4, borderRadius: 2 },
  meta:              { marginBottom: 4 },
  status:            { marginTop: 12, fontWeight: '500' },
  row:               { flexDirection: 'row' },
  btn:               { paddingHorizontal: 20, paddingVertical: 10 },
  btnOutline:        { borderWidth: 1 },
  btnText:           { fontWeight: '600' },
});
