import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  height: number;
  isLoading?: boolean;
  onGoToPuzzle?: () => void;
}

export function LockedSlot({ height, isLoading = false, onGoToPuzzle }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { height, backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.accent} />
      ) : (
        <>
          <Text style={[styles.icon, { color: colors.textSecondary }]}>♟</Text>
          <Text style={[styles.label, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
            {t('feed.lockedSlot')}
          </Text>
          {onGoToPuzzle && (
            <TouchableOpacity
              onPress={onGoToPuzzle}
              style={[styles.btn, { borderColor: colors.textSecondary + '60' }]}
            >
              <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {t('feed.goToPuzzle')}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
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
  btn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  btnText: {
    fontWeight: '500',
  },
});
