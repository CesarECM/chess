import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/stores/useUserStore';
import { useReinoStore } from '@/stores/useReinoStore';
import { usePuzzleStore } from '@/stores/usePuzzleStore';
import { useTheme } from '@/hooks/useTheme';
import { ELO_RANGES } from '@/constants';
import { CROWN_COLORS } from '@/constants/reino';
import { SessionProgressArc } from './SessionProgressArc';
import * as a11y from '@/constants/a11y';

function getPieceForElo(elo: number): string {
  const entries = Object.values(ELO_RANGES);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (elo >= entries[i].min) return entries[i].piece;
  }
  return '♟';
}

interface Props {
  sessionGateOpen?: boolean;
  onOpenSession?:  () => void;
}

export function SessionBar({ sessionGateOpen, onOpenSession }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const elo              = useUserStore((s) => s.elo);
  const streakDays       = useUserStore((s) => s.streakDays);
  const dayCompletedDate = useUserStore((s) => s.dayCompletedDate);
  const crowns           = useReinoStore((s) => s.crowns);
  const crystals         = useReinoStore((s) => s.crystals);
  const speed            = useReinoStore((s) => s.speedPointsToday);
  const lives            = useReinoStore((s) => s.lives);

  const count     = usePuzzleStore((s) => s.sessionFirstAttemptSolvedCount);
  const today     = new Date().toISOString().split('T')[0];
  const isResumen = dayCompletedDate === today;
  const piece     = getPieceForElo(elo);

  // Arc states:
  //   filling  — count 1-9, arc grows clockwise (grey → green partial)
  //   gate     — count ≥10, full arc + pulse ring
  //   resumen  — solid full arc (session confirmed today)
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!sessionGateOpen) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sessionGateOpen, pulseAnim]);

  const arcLabel = isResumen
    ? t('a11y.sessionBar.arcResumen')
    : sessionGateOpen
      ? t('a11y.sessionBar.arcGateOpen')
      : t('a11y.sessionBar.arcCounting', { count });

  return (
    <View style={styles.row}>
      <Text
        accessible
        accessibilityLabel={t('a11y.sessionBar.piece', { piece, elo })}
        style={[styles.cell, { color: colors.text, fontSize: typography.size.md }]}
      >
        {piece}
      </Text>

      {streakDays > 0 && (
        <Text
          accessible
          accessibilityLabel={t('a11y.sessionBar.streak', { days: streakDays })}
          style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}
        >
          🔥{streakDays}
        </Text>
      )}

      {/* accessible View groups children — screen reader reads the label as a single unit */}
      <View
        accessible
        accessibilityLabel={t('a11y.sessionBar.crowns', { gold: crowns.gold, silver: crowns.silver, bronze: crowns.bronze })}
        style={styles.crownsRow}
      >
        <Text style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}>♛</Text>
        {(['gold', 'silver', 'bronze'] as const).map((type) => (
          <View key={type} style={styles.crownPair}>
            <View style={[styles.dot, { backgroundColor: CROWN_COLORS[type] }]} />
            <Text style={[styles.crownCount, { color: colors.text, fontSize: typography.size.xs }]}>
              {crowns[type]}
            </Text>
          </View>
        ))}
      </View>

      <Text
        accessible
        accessibilityLabel={t('a11y.sessionBar.crystals', { count: crystals })}
        style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}
      >
        💎{crystals}
      </Text>
      <Text
        accessible
        accessibilityLabel={t('a11y.sessionBar.speed', { count: speed })}
        style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}
      >
        ⚡{speed}
      </Text>
      <Text
        accessible
        accessibilityLabel={t('a11y.sessionBar.lives', { count: lives.current })}
        style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}
      >
        ❤️{lives.current}
      </Text>

      <TouchableOpacity
        onPress={onOpenSession}
        hitSlop={8}
        {...a11y.btn(arcLabel, t('a11y.sessionBar.arcHint'))}
      >
        <View style={styles.dotWrapper}>
          {sessionGateOpen && (
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  borderColor: colors.success,
                  opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
                  transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] }) }],
                },
              ]}
            />
          )}
          <SessionProgressArc
            count={count}
            isGateOpen={!!sessionGateOpen}
            isResumen={isResumen}
            successColor={colors.success}
            trackColor={colors.textSecondary + '33'}
          />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cell:       { fontWeight: '600' },
  crownsRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crownPair:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dot:        { width: 7, height: 7, borderRadius: 3.5 },
  crownCount: { fontWeight: '600' },
  dotWrapper: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  pulseRing:  { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
});
