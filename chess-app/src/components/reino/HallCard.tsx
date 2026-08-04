import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { type HallDef, HALL_LEVEL_ITEMS } from '@/constants/reino';
import type { HallProgressEntry } from '@/stores/useReinoStore';

interface Props {
  hall:     HallDef;
  progress: HallProgressEntry | undefined;
  locked?:  boolean;
}

const ITEM_ICONS: Record<string, string> = {
  medal:     '🥇',
  painting:  '🖼',
  sculpture: '🗿',
  trophy:    '🏆',
  board:     '♟',
  special:   '✨',
};

export function HallCard({ hall, progress, locked }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const level       = progress?.level ?? 0;
  const count       = progress?.puzzlesCount ?? 0;
  const thresholds  = [...hall.thresholds];
  const nextThresh  = thresholds[level] ?? null;
  const maxLevel    = hall.maxLevel;
  const isFull      = level >= maxLevel;

  const fillPct = nextThresh
    ? Math.min(1, (count - (thresholds[level - 1] ?? 0)) / (nextThresh - (thresholds[level - 1] ?? 0)))
    : 1;

  return (
    <View style={[
      styles.card,
      { backgroundColor: colors.background, borderColor: colors.border },
      locked && styles.cardLocked,
    ]}>
      {locked && (
        <View style={styles.lockBadge}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
      )}

      <Text style={[styles.hallName, { color: locked ? colors.textSecondary : colors.text, fontSize: typography.size.sm }]}>
        {t(`reino.hall.${hall.id}`)}
      </Text>

      <Text style={[styles.tactics, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {hall.tactics.map((tc) => t(`tactic.${tc}`)).join(' · ')}
      </Text>

      {/* Level dots */}
      <View style={styles.levelDots}>
        {Array.from({ length: maxLevel }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < level
                ? { backgroundColor: colors.accent }
                : { backgroundColor: colors.border },
            ]}
          />
        ))}
      </View>

      {/* Progress bar */}
      {!isFull && nextThresh && (
        <View style={[styles.barBg, { backgroundColor: colors.border }]}>
          <View style={[styles.barFill, { backgroundColor: colors.accent, width: `${fillPct * 100}%` as any }]} />
        </View>
      )}

      <Text style={[styles.countText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {isFull
          ? t('reino.hall.complete')
          : t('reino.hall.progress', { count, next: nextThresh })}
      </Text>

      {/* Items unlocked so far */}
      {level > 0 && (
        <View style={styles.items}>
          {HALL_LEVEL_ITEMS.slice(0, level).map((itemType, i) => (
            <Text key={i} style={styles.itemIcon}>{ITEM_ICONS[itemType]}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card:       { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8, position: 'relative' },
  cardLocked: { opacity: 0.55 },
  lockBadge:  { position: 'absolute', top: 10, right: 10 },
  lockIcon:   { fontSize: 16 },
  hallName:   { fontWeight: '700' },
  tactics:    { fontWeight: '500' },
  levelDots:  { flexDirection: 'row', gap: 6 },
  dot:        { width: 10, height: 10, borderRadius: 5 },
  barBg:      { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill:    { height: 4, borderRadius: 2 },
  countText:  {},
  items:      { flexDirection: 'row', gap: 6, marginTop: 2 },
  itemIcon:   { fontSize: 18 },
});
