import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { RecapCard } from '@/components/recap/RecapCard';
import { captureAndShare } from '@/services/recap';

export default function RecapScreen() {
  const { colors, typography } = useTheme();
  const { t }    = useTranslation();
  const router   = useRouter();
  const cardRef  = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    setSharing(true);
    try {
      await captureAndShare(cardRef);
    } catch (e) {
      console.error('[recap] share failed:', e);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.back, { color: colors.accent, fontSize: typography.size.md }]}>
            ‹ {t('common.back')}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: typography.size.md }]}>
          {t('recap.title')}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Card centered on screen */}
      <View style={styles.cardWrap}>
        <RecapCard ref={cardRef} />
      </View>

      {/* Share button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: colors.accent }]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
        >
          {sharing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.shareBtnText, { fontSize: typography.size.md }]}>
              {t('recap.shareButton')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back:         { fontWeight: '500' },
  headerTitle:  { fontWeight: '700' },
  cardWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  footer:       { padding: 16, paddingBottom: 32 },
  shareBtn:     { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontWeight: '700' },
});
