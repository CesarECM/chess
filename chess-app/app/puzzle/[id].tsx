import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ChessBoard } from '@/components/chess/ChessBoard';
import type { ChessboardRef } from '@/components/chess/ChessBoard';
import { useTheme } from '@/hooks/useTheme';
import { usePuzzleSolver } from '@/hooks/usePuzzleSolver';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { useUserStore } from '@/stores/useUserStore';
import { fetchPuzzleById, fetchFirstPuzzle } from '@/services/puzzles';
import { fetchNextPuzzle } from '@/services/reviewQueue';
import { getOrCreateGuestId } from '@/services/identity';
import { PRE_ELO_NUMERIC_THRESHOLD } from '@/constants';
import { RangeBadge } from '@/components/ui/RangeBadge';

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
  const { t } = useTranslation();
  const boardRef    = useRef<ChessboardRef>(null);
  const startPuzzle = usePuzzleStore((s) => s.startPuzzle);
  const resetSolver = usePuzzleStore((s) => s.resetSolver);
  const currentPuzzle = usePuzzleStore((s) => s.currentPuzzle);
  const [loadingNext, setLoadingNext] = useState(false);
  const elo       = useUserStore((s) => s.elo);
  const preEloLow  = useUserStore((s) => s.preEloLow);
  const preEloHigh = useUserStore((s) => s.preEloHigh);

  const {
    puzzleStatus,
    onUserMove,
    startReview,
    handleAdvanceReview,
  } = usePuzzleSolver(boardRef);

  const isCalibrating = preEloLow !== null;
  const preEloRange   = isCalibrating ? preEloHigh! - preEloLow! : 0;

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

  const statusLabels: Record<string, string> = {
    idle:      t('puzzle.statusIdle'),
    playing:   t('puzzle.statusPlaying'),
    failed:    t('puzzle.statusFailed'),
    reviewing: t('puzzle.statusReviewing'),
    complete:  t('puzzle.statusComplete'),
  };

  const statusLabel    = statusLabels[puzzleStatus] ?? '';
  const statusColorKey = STATUS_COLOR[puzzleStatus] ?? 'textSecondary';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!isCalibrating && <RangeBadge elo={elo} />}

      {isCalibrating && (
        <View style={[styles.calibrationBar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[styles.calibrationText, { color: colors.accent, fontSize: typography.size.xs }]}>
            {preEloRange <= PRE_ELO_NUMERIC_THRESHOLD
              ? t('calibration.narrowing', { low: preEloLow, high: preEloHigh })
              : t('calibration.estimating')}
          </Text>
          <View style={[styles.calibrationTrack, { backgroundColor: colors.accent + '33' }]}>
            <View
              style={[
                styles.calibrationFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.max(0, Math.min(100, (1 - preEloRange / 2900) * 100))}%` as `${number}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {currentPuzzle && (
        <Text style={[styles.meta, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
          {t('puzzle.ratingMeta', { rating: currentPuzzle.rating, theme: currentPuzzle.themes[0] })}
        </Text>
      )}

      <ChessBoard
        ref={boardRef}
        fen={currentPuzzle?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
        orientation="auto"
        enabled={puzzleStatus === 'playing'}
        onMove={(uci) => onUserMove(uci)}
      />

      <Text style={[styles.status, { color: colors[statusColorKey], fontSize: typography.size.md }]}>
        {statusLabel}
      </Text>

      {puzzleStatus === 'failed' && (
        <View style={[styles.row, { gap: spacing[2] }]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOutline, { borderColor: colors.border, borderRadius: 8 }]}
            onPress={() => currentPuzzle && startPuzzle(currentPuzzle)}
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
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.success, borderRadius: 8 }]}
          onPress={handleNextPuzzle}
          disabled={loadingNext}
        >
          <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.sm }]}>
            {loadingNext ? t('puzzle.loading') : t('puzzle.nextPuzzle')}
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
