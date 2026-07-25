import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { shareReferralLink, REFERRAL_REWARD_DAYS } from '@/services/referral';

interface Props {
  userId: string;
}

export function ReferralShare({ userId }: Props) {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.md }]}
      onPress={() => shareReferralLink(userId).catch(console.error)}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, { color: '#fff', fontSize: typography.size.sm }]}>
        {t('referral.shareBtn', { days: REFERRAL_REWARD_DAYS })}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:  { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  text: { fontWeight: '700', textAlign: 'center' },
});
