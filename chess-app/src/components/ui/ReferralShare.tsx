import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { shareReferralLink } from '@/services/referral';

interface Props {
  userId: string;
}

export function ReferralShare({ userId }: Props) {
  const { colors, typography, radius } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: colors.accent, borderRadius: radius.md }]}
      onPress={() => shareReferralLink(userId).catch(console.error)}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, { color: '#fff', fontSize: typography.size.sm }]}>
        Invitar amigos — +7 días gratis por referido activo
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn:  { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  text: { fontWeight: '700', textAlign: 'center' },
});
