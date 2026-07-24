import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TacticType } from '@/types';

const TACTIC_LABELS: Partial<Record<TacticType, string>> = {
  mate:             'Mate',
  fork:             'Horquilla',
  pin:              'Clavada',
  skewer:           'Espeto',
  discoveredAttack: 'Ataque descubierto',
  deflection:       'Desviación',
  other:            'Táctica',
};

interface Props {
  tactic: TacticType;
  puzzleRating: number;
  elo: number;
  streakDays: number;
  puzzlesCompleted: number;
}

export const ShareCard = forwardRef<View, Props>(function ShareCard(
  { tactic, puzzleRating, elo, streakDays, puzzlesCompleted },
  ref,
) {
  return (
    <View ref={ref} style={styles.offscreen} collapsable={false}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.chess}>♟</Text>
          <Text style={styles.appName}>Chess Puzzle App</Text>
        </View>

        {/* Tactic highlight */}
        <View style={styles.tacticBlock}>
          <Text style={styles.tacticLabel}>TÁCTICA</Text>
          <Text style={styles.tacticName}>{TACTIC_LABELS[tactic] ?? 'Táctica'}</Text>
          <Text style={styles.puzzleRating}>Nivel del puzzle: {puzzleRating}</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatItem value={elo} label="ELO" />
          <View style={styles.statDivider} />
          <StatItem value={`🔥 ${streakDays}d`} label="Racha" />
          <View style={styles.statDivider} />
          <StatItem value={puzzlesCompleted} label="Resueltos" />
        </View>

        {/* Footer */}
        <Text style={styles.cta}>¡Entrena tu táctica cada día!</Text>
      </View>
    </View>
  );
});

function StatItem({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const BG      = '#0f1117';
const SURFACE = '#1c1f2e';
const ACCENT  = '#6c8fff';
const WHITE   = '#f0f2ff';
const MUTED   = '#8890b0';

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  card: {
    width: 320,
    backgroundColor: BG,
    borderRadius: 20,
    padding: 28,
    gap: 20,
    borderWidth: 1,
    borderColor: SURFACE,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chess: {
    fontSize: 28,
    color: ACCENT,
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
    letterSpacing: 0.4,
  },
  tacticBlock: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 18,
    gap: 4,
    alignItems: 'center',
  },
  tacticLabel: {
    fontSize: 10,
    color: MUTED,
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  tacticName: {
    fontSize: 26,
    fontWeight: '800',
    color: WHITE,
    textAlign: 'center',
  },
  puzzleRating: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2c3050',
    marginVertical: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: WHITE,
  },
  statLabel: {
    fontSize: 10,
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cta: {
    fontSize: 13,
    color: ACCENT,
    textAlign: 'center',
    fontWeight: '500',
  },
});
