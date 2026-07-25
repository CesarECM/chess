import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { ELO_RANGES } from '@/constants';
import { getRangeFromElo, clamp } from '@/utils';

interface Props {
  elo: number;
}

const RANGE_ORDER = Object.values(ELO_RANGES);

export function RangeBadge({ elo }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const current   = getRangeFromElo(elo);
  const nextIndex = RANGE_ORDER.findIndex((r) => r === current) + 1;
  const next      = RANGE_ORDER[nextIndex] as typeof RANGE_ORDER[number] | undefined;

  const isTop     = !next;
  const progress  = isTop
    ? 1
    : clamp((elo - current.min) / (current.max - current.min), 0, 1);
  const ptsToNext = isTop ? 0 : current.max - elo;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.piece, { fontSize: typography.size.xl }]}>{current.piece}</Text>
        <View style={styles.labelBlock}>
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.sm }]}>
            {t(`elo.${current.label}`)}
          </Text>
          <Text style={[styles.elo, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {elo} ELO
          </Text>
        </View>
        {!isTop && next && (
          <Text style={[styles.nextLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('elo.ptsToNext', { pts: ptsToNext, piece: next.piece })}
          </Text>
        )}
        {isTop && (
          <Text style={[styles.nextLabel, { color: colors.accent, fontSize: typography.size.xs }]}>
            {t('elo.maxRank')}
          </Text>
        )}
      </View>

      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: colors.accent,
              width: `${Math.round(progress * 100)}%` as `${number}%`,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { width: '88%', borderRadius: 10, borderWidth: 1, padding: 10, gap: 8 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  piece:      { lineHeight: 28 },
  labelBlock: { flex: 1 },
  label:      { fontWeight: '700' },
  elo:        { marginTop: 1 },
  nextLabel:  { fontWeight: '500', textAlign: 'right' },
  track:      { height: 5, borderRadius: 3, width: '100%', overflow: 'hidden' },
  fill:       { height: 5, borderRadius: 3 },
});
