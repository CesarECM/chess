import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';

export function LockedSlot({ height }: { height: number }) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { height, backgroundColor: colors.background }]}>
      <Text style={[styles.icon, { color: colors.textSecondary }]}>♟</Text>
      <Text style={[styles.label, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
        {t('feed.lockedSlot')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  icon: {
    fontSize: 64,
    opacity: 0.25,
  },
  label: {
    fontWeight: '500',
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
