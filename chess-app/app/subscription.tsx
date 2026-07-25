import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { getMonthlyPackage, purchasePackage, restorePurchases } from '@/services/purchases';
import { openStripeCheckout } from '@/services/stripe';
import { getOrCreateGuestId } from '@/services/identity';
import type { PurchasesPackage } from 'react-native-purchases';

export default function SubscriptionScreen() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const router  = useRouter();
  const { user } = useAuthStore();
  const isPremium = useUserStore((s) => s.isPremium);

  const [pkg,        setPkg]        = useState<PurchasesPackage | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [buying,     setBuying]     = useState(false);
  const [restoring,  setRestoring]  = useState(false);
  const [message,    setMessage]    = useState<string | null>(null);
  const [msgSuccess, setMsgSuccess] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') { setLoading(false); return; }
    getMonthlyPackage().then((p) => { setPkg(p); setLoading(false); });
  }, []);

  async function handlePurchase() {
    setBuying(true);
    setMessage(null);
    try {
      if (Platform.OS === 'web') {
        const userId = user?.id ?? (await getOrCreateGuestId());
        const result = await openStripeCheckout(userId);
        if (result === 'success') { setMessage(t('subscription.msgSuccess')); setMsgSuccess(true); }
        else if (result === 'error') { setMessage(t('subscription.msgError')); setMsgSuccess(false); }
      } else {
        if (!pkg) { setMessage(t('subscription.msgNoProduct')); setMsgSuccess(false); return; }
        const ok = await purchasePackage(pkg);
        if (ok) { setMessage(t('subscription.msgPurchased')); setMsgSuccess(true); }
        else { setMessage(t('subscription.msgError')); setMsgSuccess(false); }
      }
    } finally {
      setBuying(false);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    setMessage(null);
    const ok = await restorePurchases();
    if (ok) { setMessage(t('subscription.msgPurchased')); setMsgSuccess(true); }
    else { setMessage(t('subscription.msgNotFound')); setMsgSuccess(false); }
    setRestoring(false);
  }

  const priceLabel = pkg?.product.priceString ?? '$2.99';

  const BENEFITS = [
    t('subscription.benefit1'),
    t('subscription.benefit2'),
    t('subscription.benefit3'),
    t('subscription.benefit4'),
  ];

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xl }]}>✕</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.text, fontSize: typography.size['2xl'] }]}>
        {t('subscription.title')}
      </Text>
      <Text style={[styles.subtitle, { color: colors.accent, fontSize: typography.size.lg }]}>
        Premium
      </Text>

      <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefitRow}>
            <Text style={[{ color: colors.success, fontSize: typography.size.md }]}>✓</Text>
            <Text style={[styles.benefitText, { color: colors.text, fontSize: typography.size.sm }]}>
              {b}
            </Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
      ) : (
        <Text style={[styles.price, { color: colors.text, fontSize: typography.size['2xl'] }]}>
          {priceLabel}
          <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm }]}> {t('subscription.perMonth')}</Text>
        </Text>
      )}

      {isPremium ? (
        <View style={[styles.alreadyPremium, { backgroundColor: colors.success + '22', borderRadius: radius.md }]}>
          <Text style={[{ color: colors.success, fontSize: typography.size.md, fontWeight: '700', textAlign: 'center' }]}>
            {t('subscription.alreadyPremium')}
          </Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[styles.buyBtn, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: buying || loading ? 0.6 : 1 }]}
            onPress={handlePurchase}
            disabled={buying || loading}
          >
            {buying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buyText, { fontSize: typography.size.md }]}>
                {t('subscription.subscribe', { price: priceLabel })}
              </Text>
            )}
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <TouchableOpacity style={[styles.restoreBtn]} onPress={handleRestore} disabled={restoring}>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm }]}>
                {restoring ? t('subscription.restoring') : t('subscription.restore')}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {message && (
        <Text style={[styles.message, { color: msgSuccess ? colors.success : colors.error, fontSize: typography.size.sm }]}>
          {message}
        </Text>
      )}

      <Text style={[styles.legal, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('subscription.legal')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:          { flex: 1 },
  content:       { padding: 24, paddingTop: 60, paddingBottom: 40, gap: 16, alignItems: 'stretch' },
  closeBtn:      { position: 'absolute', top: 20, right: 24, padding: 8 },
  title:         { fontWeight: '800', textAlign: 'center', marginTop: 20 },
  subtitle:      { fontWeight: '700', textAlign: 'center' },
  benefitsCard:  { borderWidth: 1, padding: 16, gap: 12 },
  benefitRow:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  benefitText:   { flex: 1, lineHeight: 20 },
  price:         { fontWeight: '800', textAlign: 'center', marginVertical: 4 },
  buyBtn:        { paddingVertical: 16, alignItems: 'center' },
  buyText:       { color: '#fff', fontWeight: '700' },
  restoreBtn:    { alignItems: 'center', paddingVertical: 8 },
  alreadyPremium:{ padding: 16, marginVertical: 8 },
  message:       { textAlign: 'center', fontWeight: '500' },
  legal:         { textAlign: 'center', lineHeight: 16, marginTop: 8 },
});
