import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  height:     number;
  onConfirm:  () => void;  // "Ver siguiente" — mark prev as failed, show board
  onGoBack:   () => void;  // "Volver al puzzle" — scroll back, discard warning
}

export function SkipWarningModal({ height, onConfirm, onGoBack }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.overlay, { height, backgroundColor: colors.background }]}>
      <View style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20 },
      ]}>
        <Text style={[styles.icon, { color: colors.accent }]}>♟</Text>

        <Text style={[styles.title, { color: colors.text, fontSize: typography.size.lg }]}>
          {t('skipWarning.title')}
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
          {t('skipWarning.body')}
        </Text>

        <TouchableOpacity
          style={[styles.btnPrimary, { backgroundColor: colors.accent, borderRadius: 10, marginTop: spacing[4] }]}
          onPress={onConfirm}
        >
          <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
            {t('skipWarning.confirm')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, { borderColor: colors.border, borderRadius: 10 }]}
          onPress={onGoBack}
        >
          <Text style={[styles.btnText, { color: colors.text, fontSize: typography.size.md }]}>
            {t('skipWarning.goBack')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay:      { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  card:         { width: '88%', alignItems: 'center', padding: 32, borderWidth: 1, gap: 12 },
  icon:         { fontSize: 52 },
  title:        { fontWeight: '700', textAlign: 'center' },
  body:         { textAlign: 'center', lineHeight: 22 },
  btnPrimary:   { width: '100%', paddingVertical: 12, alignItems: 'center' },
  btnSecondary: { width: '100%', paddingVertical: 12, alignItems: 'center', borderWidth: 1, marginTop: 4 },
  btnText:      { fontWeight: '600' },
});
