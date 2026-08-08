import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { RangeBadge } from '@/components/ui/RangeBadge';
import { StreakBadge } from '@/components/ui/StreakBadge';
import { MedalGrid } from '@/components/ui/MedalGrid';
import { loadSolveHistory, type SolveEvent } from '@/services/solveHistory';
import { loadReferralStats, REFERRAL_PUZZLES_REQUIRED } from '@/services/referral';
import { ReferralShare } from '@/components/ui/ReferralShare';
import { getOrCreateGuestId } from '@/services/identity';

const PAGE_SIZE = 10;

export default function ProfileScreen() {
  const { colors, typography } = useTheme();
  const { t, i18n } = useTranslation();
  const { user, isGuest } = useAuthStore();
  const router = useRouter();
  const {
    elo,
    puzzlesCompleted,
    puzzlesFailed,
    streakDays,
    streakLongest,
    weeklyPuzzleCount,
    unlockedMedals,
  } = useUserStore();

  const total      = puzzlesCompleted + puzzlesFailed;
  const successPct = total > 0 ? Math.round((puzzlesCompleted / total) * 100) : 0;

  const [referralStats, setReferralStats] = useState<{ total: number; activated: number } | null>(null);
  const [history, setHistory]   = useState<SolveEvent[]>([]);
  const [histOffset, setHistOffset] = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);

  const fetchHistory = useCallback(async (offset: number) => {
    setLoadingHist(true);
    try {
      const userId = user?.id ?? (await getOrCreateGuestId());
      const batch  = await loadSolveHistory(userId, PAGE_SIZE + 1, offset);
      const hasNext = batch.length > PAGE_SIZE;
      const items   = hasNext ? batch.slice(0, PAGE_SIZE) : batch;
      setHistory((prev) => (offset === 0 ? items : [...prev, ...items]));
      setHasMore(hasNext);
      setHistOffset(offset + items.length);
    } finally {
      setLoadingHist(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchHistory(0); }, [fetchHistory]);

  useEffect(() => {
    if (!user?.id) return;
    loadReferralStats(user.id).then(setReferralStats).catch(console.error);
  }, [user?.id]);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.identity}>
        <Text style={[styles.displayName, { color: colors.text, fontSize: typography.size.xl }]}>
          {isGuest ? t('profile.guestName') : (user?.email?.split('@')[0] ?? t('profile.guestName'))}
        </Text>
        {isGuest && (
          <>
            <Text style={[styles.guestHint, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {t('profile.guestHint')}
            </Text>
            <TouchableOpacity
              style={[styles.signInBtn, { borderColor: colors.tabBarActive }]}
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.7}
            >
              <Text style={[styles.signInBtnText, { color: colors.tabBarActive, fontSize: typography.size.sm }]}>
                {t('auth.signIn')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Recap button */}
      <TouchableOpacity
        style={[styles.recapBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={() => router.push('/profile/recap')}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 18 }}>📊</Text>
        <Text style={[styles.recapBtnText, { color: colors.text, fontSize: typography.size.sm }]}>
          {t('recap.viewRecap')}
        </Text>
        <Text style={[{ color: colors.textSecondary, fontSize: 22, fontWeight: '300' }]}>›</Text>
      </TouchableOpacity>

      <Section label={t('profile.sectionRank')} colors={colors} typography={typography}>
        <RangeBadge elo={elo} />
      </Section>

      <Section label={t('profile.sectionStats')} colors={colors} typography={typography}>
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatCell value={puzzlesCompleted} label={t('profile.solved')}  colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={`${successPct}%`} label={t('profile.success')} colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={puzzlesFailed}    label={t('profile.failed')}  colors={colors} typography={typography} />
        </View>
      </Section>

      <Section label={t('profile.sectionStreak')} colors={colors} typography={typography}>
        <StreakBadge
          streakDays={streakDays}
          streakLongest={streakLongest}
          weeklyPuzzleCount={weeklyPuzzleCount}
        />
      </Section>

      {user?.id && (
        <Section label={t('profile.sectionReferrals')} colors={colors} typography={typography}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.statsRow}>
              <StatCell value={referralStats?.total ?? 0}     label={t('profile.referralInvited')}   colors={colors} typography={typography} />
              <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
              <StatCell value={referralStats?.activated ?? 0} label={t('profile.referralActivated')} colors={colors} typography={typography} />
              <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
              <StatCell value={`+${(referralStats?.activated ?? 0) * 7}d`} label={t('profile.referralFreeDays')} colors={colors} typography={typography} />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs, marginBottom: 8 }]}>
                {t('profile.referralHint', { n: REFERRAL_PUZZLES_REQUIRED })}
              </Text>
              <ReferralShare userId={user.id} />
            </View>
          </View>
        </Section>
      )}

      <Section label={t('profile.sectionHistory')} colors={colors} typography={typography}>
        {history.length === 0 && !loadingHist ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center' }]}>
              {t('profile.historyEmpty')}
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {history.map((ev, i) => (
              <View key={`${ev.puzzleId}-${ev.date}`}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <HistoryRow event={ev} colors={colors} typography={typography} locale={i18n.language} t={t} />
              </View>
            ))}
            {hasMore && (
              <TouchableOpacity
                style={[styles.loadMoreBtn, { borderTopColor: colors.border }]}
                onPress={() => fetchHistory(histOffset)}
                disabled={loadingHist}
              >
                <Text style={[{ color: colors.tabBarActive, fontSize: typography.size.sm, fontWeight: '600' }]}>
                  {loadingHist ? t('profile.historyLoading') : t('profile.historyMore')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Section>

      <Section label={t('profile.sectionAccount')} colors={colors} typography={typography}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AccountRow label={t('profile.accountName')} value={isGuest ? t('profile.accountGuest') : (useUserStore.getState().displayName || (user?.email?.split('@')[0] ?? '—'))} colors={colors} typography={typography} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <AccountRow label={t('profile.accountEmail')} value={isGuest ? '—' : (user?.email ?? '—')} colors={colors} typography={typography} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <AccountRow label={t('profile.accountId')} value={user?.id ?? t('profile.accountGuest')} mono colors={colors} typography={typography} />
        </View>
      </Section>

      <Section label={t('profile.sectionMedals', { unlocked: unlockedMedals.length })} colors={colors} typography={typography}>
        <MedalGrid unlockedMedals={unlockedMedals} />
      </Section>
    </ScrollView>
  );
}

function HistoryRow({
  event, colors, typography, locale, t,
}: {
  event: SolveEvent;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const dateStr = new Date(event.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return (
    <View style={styles.histRow}>
      <Text style={[styles.histIcon, { color: event.solved ? colors.success : colors.error }]}>
        {event.solved ? '✓' : '✗'}
      </Text>
      <View style={styles.histInfo}>
        <Text style={[styles.histTactic, { color: colors.text, fontSize: typography.size.sm }]}>
          {t(`tactic.${event.tactic}`) ?? event.tactic}
        </Text>
        <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs }]}>
          {t('profile.historyPuzzle', { rating: event.rating, elo: event.eloAfter })}
        </Text>
      </View>
      <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {dateStr}
      </Text>
    </View>
  );
}

function AccountRow({ label, value, mono = false, colors, typography }: {
  label: string;
  value: string;
  mono?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  return (
    <View style={styles.accountRow}>
      <Text style={[styles.accountLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {label}
      </Text>
      <Text
        style={[styles.accountValue, { color: colors.text, fontSize: typography.size.xs }, mono && styles.accountMono]}
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {value}
      </Text>
    </View>
  );
}

function Section({ label, children, colors, typography }: {
  label: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function StatCell({ value, label, colors, typography }: {
  value: number | string;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: colors.text, fontSize: typography.size['2xl'] }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  content:      { padding: 16, paddingTop: 60, paddingBottom: 32, gap: 20 },
  identity:     { alignItems: 'center', paddingVertical: 8 },
  displayName:  { fontWeight: '700' },
  guestHint:    { marginTop: 4, textAlign: 'center' },
  recapBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  recapBtnText: { flex: 1, fontWeight: '600' },
  section:      { gap: 8, alignItems: 'stretch' },
  sectionLabel: { letterSpacing: 0.5, fontWeight: '600', marginLeft: 2 },
  statsRow:     { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  statCell:     { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2 },
  cellDivider:  { width: 1 },
  statValue:    { fontWeight: '700' },
  statLabel:    { textTransform: 'uppercase', letterSpacing: 0.4 },
  card:         { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  emptyCard:    { borderRadius: 12, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 16 },
  divider:      { height: 1 },
  histRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  histIcon:     { fontSize: 16, fontWeight: '700', width: 18, textAlign: 'center' },
  histInfo:     { flex: 1, gap: 2 },
  histTactic:   { fontWeight: '500' },
  loadMoreBtn:  { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, marginTop: 2 },
  accountRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  accountLabel: { fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', flexShrink: 0 },
  accountValue: { flex: 1, textAlign: 'right' },
  accountMono:  { fontFamily: 'monospace' },
  signInBtn:    { marginTop: 12, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 8 },
  signInBtnText:{ fontWeight: '600' },
});
