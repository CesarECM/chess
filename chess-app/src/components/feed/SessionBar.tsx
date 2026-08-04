import { StyleSheet, Text, View } from 'react-native';
import { useUserStore } from '@/stores/useUserStore';
import { useReinoStore } from '@/stores/useReinoStore';
import { useTheme } from '@/hooks/useTheme';
import { ELO_RANGES } from '@/constants';
import { CROWN_COLORS } from '@/constants/reino';

function getPieceForElo(elo: number): string {
  const entries = Object.values(ELO_RANGES);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (elo >= entries[i].min) return entries[i].piece;
  }
  return '♟';
}

export function SessionBar() {
  const { colors, typography } = useTheme();
  const elo        = useUserStore((s) => s.elo);
  const streakDays = useUserStore((s) => s.streakDays);
  const crowns     = useReinoStore((s) => s.crowns);
  const crystals   = useReinoStore((s) => s.crystals);
  const speed      = useReinoStore((s) => s.speedPointsToday);
  const lives      = useReinoStore((s) => s.lives);

  const piece = getPieceForElo(elo);

  return (
    <View style={styles.row}>
      <Text style={[styles.cell, { color: colors.text, fontSize: typography.size.md }]}>
        {piece}
      </Text>

      {streakDays > 0 && (
        <Text style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}>
          🔥{streakDays}
        </Text>
      )}

      <View style={styles.crownsRow}>
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

      <Text style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}>
        💎{crystals}
      </Text>
      <Text style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}>
        ⚡{speed}
      </Text>
      <Text style={[styles.cell, { color: colors.text, fontSize: typography.size.xs }]}>
        ❤️{lives.current}
      </Text>
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
});
