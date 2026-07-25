import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  streakDays: number;
  streakLongest: number;
  weeklyPuzzleCount: number;
}

export function StreakBadge({ streakDays, streakLongest, weeklyPuzzleCount }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Stat emoji="🔥" value={streakDays}         label={t('streak.current')}  colors={colors} typography={typography} accent />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Stat emoji="🏆" value={streakLongest}       label={t('streak.longest')}  colors={colors} typography={typography} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Stat emoji="📅" value={weeklyPuzzleCount}   label={t('streak.thisWeek')} colors={colors} typography={typography} />
    </View>
  );
}

function Stat({
  emoji, value, label, colors, typography, accent,
}: {
  emoji: string;
  value: number;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  accent?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={{ fontSize: typography.size.xl }}>{emoji}</Text>
      <Text style={[styles.value, { color: accent ? colors.accent : colors.text, fontSize: typography.size['2xl'] }]}>
        {value}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stat:    { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2 },
  divider: { width: 1 },
  value:   { fontWeight: '700' },
  label:   { textTransform: 'uppercase', letterSpacing: 0.4 },
});
