import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';

export function GDPRConsentModal() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const gdprConsentDate = useUserStore((s) => s.gdprConsentDate);
  const setGdprConsent = useUserStore((s) => s.setGdprConsent);

  const visible = gdprConsentDate === null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radius.lg }]}>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.size.lg }]}>
            {t('gdpr.title')}
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
            {t('gdpr.body')}
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent, borderRadius: radius.sm }]}
            onPress={() => setGdprConsent(true)}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
              {t('gdpr.acceptAll')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => setGdprConsent(false)}
          >
            <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.md }]}>
              {t('gdpr.essentialOnly')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  card:       { margin: 16, padding: 24, marginBottom: 32 },
  title:      { fontWeight: '700', marginBottom: 12 },
  body:       { lineHeight: 20, marginBottom: 24 },
  btn:        { paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  btnPrimary: {},
  btnText:    { fontWeight: '600' },
});
