import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { MEDALS } from '@/constants/medals';

interface Props {
  unlockedMedals: string[];
}

export function MedalGrid({ unlockedMedals }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const unlockedSet = new Set(unlockedMedals);

  // Split into rows of 3
  const rows: (typeof MEDALS)[] = [];
  for (let i = 0; i < MEDALS.length; i += 3) {
    rows.push(MEDALS.slice(i, i + 3));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((medal) => {
            const unlocked = unlockedSet.has(medal.id);
            return (
              <View
                key={medal.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: unlocked ? colors.accent : colors.border,
                    opacity: unlocked ? 1 : 0.45,
                  },
                ]}
              >
                <Text style={[styles.emoji, { fontSize: typography.size['2xl'] }]}>
                  {unlocked ? medal.emoji : '🔒'}
                </Text>
                <Text
                  style={[
                    styles.label,
                    { color: unlocked ? colors.text : colors.textSecondary, fontSize: typography.size.xs },
                  ]}
                  numberOfLines={1}
                >
                  {unlocked ? t(`medal.${medal.id}_label`) : '???'}
                </Text>
                {unlocked && (
                  <Text
                    style={[styles.desc, { color: colors.textSecondary, fontSize: 10 }]}
                    numberOfLines={2}
                  >
                    {t(`medal.${medal.id}_desc`)}
                  </Text>
                )}
              </View>
            );
          })}
          {/* Fill empty slots in last row */}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.card} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid:  { gap: 8 },
  row:   { flexDirection: 'row', gap: 8 },
  card:  {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    minHeight: 80,
  },
  emoji: { lineHeight: 32 },
  label: { fontWeight: '600', textAlign: 'center' },
  desc:  { textAlign: 'center', lineHeight: 13 },
});
