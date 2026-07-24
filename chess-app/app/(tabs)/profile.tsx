import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { RangeBadge } from '@/components/ui/RangeBadge';
import { StreakBadge } from '@/components/ui/StreakBadge';
import { MedalGrid } from '@/components/ui/MedalGrid';
import { loadSolveHistory, type SolveEvent } from '@/services/solveHistory';
import { loadReferralStats, REFERRAL_REWARD_DAYS, REFERRAL_PUZZLES_REQUIRED } from '@/services/referral';
import { ReferralShare } from '@/components/ui/ReferralShare';
import { getOrCreateGuestId } from '@/services/identity';

const TACTIC_LABELS: Record<string, string> = {
  mate:             'Mate',
  fork:             'Horquilla',
  pin:              'Clavada',
  skewer:           'Espeto',
  discoveredAttack: 'Ataque desc.',
  deflection:       'Desviación',
  other:            'Otros',
};

const PAGE_SIZE = 10;
const BAR_MAX_H = 48;

export default function ProfileScreen() {
  const { colors, typography } = useTheme();
  const { user, isGuest } = useAuthStore();
  const {
    elo,
    puzzlesCompleted,
    puzzlesFailed,
    streakDays,
    streakLongest,
    weeklyPuzzleCount,
    unlockedMedals,
    eloHistory,
  } = useUserStore();

  const total      = puzzlesCompleted + puzzlesFailed;
  const successPct = total > 0 ? Math.round((puzzlesCompleted / total) * 100) : 0;

  // ── Solve history (S8.2) ──────────────────────────────────────────────────
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

  // ── ELO chart (S8.3) ──────────────────────────────────────────────────────
  const chartData = eloHistory.slice(-14);
  const chartMin  = chartData.length > 0 ? Math.min(...chartData.map((s) => s.elo)) : 0;
  const chartMax  = chartData.length > 0 ? Math.max(...chartData.map((s) => s.elo)) : 0;
  const chartRange = chartMax - chartMin || 1;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Identity ───────────────────────────────────────────── */}
      <View style={styles.identity}>
        <Text style={[styles.displayName, { color: colors.text, fontSize: typography.size.xl }]}>
          {isGuest ? 'Jugador invitado' : (user?.email ?? 'Jugador')}
        </Text>
        {isGuest && (
          <Text style={[styles.guestHint, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            Crea una cuenta para guardar tu progreso en la nube
          </Text>
        )}
      </View>

      {/* ── ELO Range ──────────────────────────────────────────── */}
      <Section label="RANGO" colors={colors} typography={typography}>
        <RangeBadge elo={elo} />
      </Section>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <Section label="ESTADÍSTICAS" colors={colors} typography={typography}>
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatCell value={puzzlesCompleted} label="resueltos"   colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={`${successPct}%`} label="éxito"      colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={puzzlesFailed}    label="fallados"    colors={colors} typography={typography} />
        </View>
      </Section>

      {/* ── Streak ─────────────────────────────────────────────── */}
      <Section label="RACHA" colors={colors} typography={typography}>
        <StreakBadge
          streakDays={streakDays}
          streakLongest={streakLongest}
          weeklyPuzzleCount={weeklyPuzzleCount}
        />
      </Section>

      {/* ── ELO Evolution (S8.3) ───────────────────────────────── */}
      <Section label="EVOLUCIÓN ELO" colors={colors} typography={typography}>
        {chartData.length < 2 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center' }]}>
              El gráfico aparece tras varios días de práctica.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.chartRow}>
              {chartData.map((snap, i) => {
                const barH = Math.max(
                  6,
                  Math.round(((snap.elo - chartMin) / chartRange) * BAR_MAX_H),
                );
                const isLast = i === chartData.length - 1;
                return (
                  <View key={snap.date} style={styles.barWrap}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barH,
                          backgroundColor: isLast ? colors.tabBarActive : colors.tabBarInactive,
                        },
                      ]}
                    />
                    <Text style={[styles.barDate, { color: colors.textSecondary, fontSize: 9 }]}>
                      {snap.date.slice(5)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.chartLegend}>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs }]}>{chartMin}</Text>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs }]}>{chartMax}</Text>
            </View>
          </View>
        )}
      </Section>

      {/* ── Referidos (S10) ────────────────────────────────────── */}
      {user?.id && (
        <Section label="REFERIDOS" colors={colors} typography={typography}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.statsRow}>
              <StatCell
                value={referralStats?.total ?? 0}
                label="invitados"
                colors={colors}
                typography={typography}
              />
              <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
              <StatCell
                value={referralStats?.activated ?? 0}
                label="activados"
                colors={colors}
                typography={typography}
              />
              <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
              <StatCell
                value={`+${(referralStats?.activated ?? 0) * REFERRAL_REWARD_DAYS}d`}
                label="días gratis"
                colors={colors}
                typography={typography}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs, marginBottom: 8 }]}>
                Tu amigo debe completar {REFERRAL_PUZZLES_REQUIRED} puzzles para activar la recompensa.
              </Text>
              <ReferralShare userId={user.id} />
            </View>
          </View>
        </Section>
      )}

      {/* ── Historial (S8.2) ───────────────────────────────────── */}
      <Section label="HISTORIAL" colors={colors} typography={typography}>
        {history.length === 0 && !loadingHist ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center' }]}>
              Aún no has resuelto ningún puzzle.
            </Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {history.map((ev, i) => (
              <View key={`${ev.puzzleId}-${ev.date}`}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                <HistoryRow event={ev} colors={colors} typography={typography} />
              </View>
            ))}
            {hasMore && (
              <TouchableOpacity
                style={[styles.loadMoreBtn, { borderTopColor: colors.border }]}
                onPress={() => fetchHistory(histOffset)}
                disabled={loadingHist}
              >
                <Text style={[{ color: colors.tabBarActive, fontSize: typography.size.sm, fontWeight: '600' }]}>
                  {loadingHist ? 'Cargando…' : 'Ver más'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Section>

      {/* ── Medals ─────────────────────────────────────────────── */}
      <Section label={`MEDALLAS (${unlockedMedals.length}/15)`} colors={colors} typography={typography}>
        <MedalGrid unlockedMedals={unlockedMedals} />
      </Section>
    </ScrollView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HistoryRow({
  event, colors, typography,
}: {
  event: SolveEvent;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  const dateStr = new Date(event.date).toLocaleDateString('es-MX', {
    month: 'short', day: 'numeric',
  });
  return (
    <View style={styles.histRow}>
      <Text style={[styles.histIcon, { color: event.solved ? colors.success : colors.error }]}>
        {event.solved ? '✓' : '✗'}
      </Text>
      <View style={styles.histInfo}>
        <Text style={[styles.histTactic, { color: colors.text, fontSize: typography.size.sm }]}>
          {TACTIC_LABELS[event.tactic] ?? event.tactic}
        </Text>
        <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs }]}>
          Puzzle {event.rating} · ELO {event.eloAfter}
        </Text>
      </View>
      <Text style={[{ color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {dateStr}
      </Text>
    </View>
  );
}

function Section({
  label, children, colors, typography,
}: {
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

function StatCell({
  value, label, colors, typography,
}: {
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:         { flex: 1 },
  content:      { padding: 16, paddingTop: 60, paddingBottom: 32, gap: 20 },
  identity:     { alignItems: 'center', paddingVertical: 8 },
  displayName:  { fontWeight: '700' },
  guestHint:    { marginTop: 4, textAlign: 'center' },
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

  // ELO chart
  chartRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60, paddingHorizontal: 12, paddingTop: 12 },
  barWrap:      { flex: 1, alignItems: 'center', gap: 2 },
  bar:          { width: '100%', borderRadius: 2 },
  barDate:      { textAlign: 'center' },
  chartLegend:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4 },

  // History
  histRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  histIcon:     { fontSize: 16, fontWeight: '700', width: 18, textAlign: 'center' },
  histInfo:     { flex: 1, gap: 2 },
  histTactic:   { fontWeight: '500' },
  loadMoreBtn:  { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, marginTop: 2 },
});
