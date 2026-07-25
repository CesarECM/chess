import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { loadFSRSProjection, type FSRSProjection } from '@/services/progressDashboard';
import { getOrCreateGuestId } from '@/services/identity';
import type { TacticType } from '@/types';

const TACTIC_ORDER: TacticType[] = [
  'mate', 'fork', 'pin', 'skewer', 'discoveredAttack', 'deflection', 'other',
];

export default function ProgressScreen() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const {
    puzzlesCompleted,
    puzzlesFailed,
    solvedByTheme,
    failedByTheme,
    eloHistory,
  } = useUserStore();

  const [projection, setProjection] = useState<FSRSProjection | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = user?.id ?? (await getOrCreateGuestId());
      const data = await loadFSRSProjection(userId);
      if (!cancelled) setProjection(data);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const total      = puzzlesCompleted + puzzlesFailed;
  const successPct = total > 0 ? Math.round((puzzlesCompleted / total) * 100) : 0;

  const tacticRows = useMemo(() => {
    return TACTIC_ORDER
      .map((tactic) => {
        const s = solvedByTheme[tactic] ?? 0;
        const f = failedByTheme[tactic] ?? 0;
        const tot = s + f;
        if (tot === 0) return null;
        return { tactic, solved: s, total: tot, pct: Math.round((s / tot) * 100) };
      })
      .filter(Boolean) as { tactic: TacticType; solved: number; total: number; pct: number }[];
  }, [solvedByTheme, failedByTheme]);

  const maxTacticTotal = tacticRows.reduce((m, r) => Math.max(m, r.total), 1);

  const chartData = eloHistory.slice(-14);
  const chartMin  = chartData.length > 0 ? Math.min(...chartData.map((s) => s.elo)) : 0;
  const chartMax  = chartData.length > 0 ? Math.max(...chartData.map((s) => s.elo)) : 0;
  const chartRange = chartMax - chartMin || 1;
  const BAR_MAX_H  = 64;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Section label={t('progress.sectionSummary')} colors={colors} typography={typography}>
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatCell value={puzzlesCompleted} label={t('progress.solved')}  colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={`${successPct}%`} label={t('progress.success')} colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={puzzlesFailed}    label={t('progress.failed')}  colors={colors} typography={typography} />
        </View>
      </Section>

      <Section label={t('progress.sectionTactics')} colors={colors} typography={typography}>
        {tacticRows.length === 0 ? (
          <EmptyHint text={t('progress.tacticsEmpty')} colors={colors} typography={typography} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {tacticRows.map((row, i) => (
              <View key={row.tactic}>
                {i > 0 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
                <View style={styles.tacticRow}>
                  <Text style={[styles.tacticLabel, { color: colors.text, fontSize: typography.size.sm }]}>
                    {t(`tactic.${row.tactic}`)}
                  </Text>
                  <View style={styles.tacticBarWrap}>
                    <View style={[styles.tacticBarBg, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.tacticBarFill,
                          {
                            backgroundColor: colors.tabBarActive,
                            width: `${Math.round((row.total / maxTacticTotal) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.tacticMeta, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                    {row.solved}/{row.total} · {row.pct}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section label={t('progress.sectionFSRS')} colors={colors} typography={typography}>
        <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatCell value={projection?.dueToday ?? '—'}    label={t('progress.today')}    colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={projection?.dueThisWeek ?? '—'} label={t('progress.thisWeek')} colors={colors} typography={typography} />
          <View style={[styles.cellDivider, { backgroundColor: colors.border }]} />
          <StatCell value={projection?.totalLearned ?? '—'} label={t('progress.learned')} colors={colors} typography={typography} />
        </View>
      </Section>

      <Section label={t('progress.sectionEloHistory')} colors={colors} typography={typography}>
        {chartData.length < 2 ? (
          <EmptyHint text={t('progress.eloEmpty')} colors={colors} typography={typography} />
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.chartRow}>
              {chartData.map((snap, i) => {
                const barH = Math.max(8, Math.round(((snap.elo - chartMin) / chartRange) * BAR_MAX_H));
                const isLast = i === chartData.length - 1;
                return (
                  <View key={snap.date} style={styles.barWrap}>
                    <View style={[styles.bar, { height: barH, backgroundColor: isLast ? colors.tabBarActive : colors.tabBarInactive }]} />
                    <Text style={[styles.barDate, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                      {snap.date.slice(5)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.chartLegend}>
              <Text style={[styles.legendText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>{chartMin}</Text>
              <Text style={[styles.legendText, { color: colors.textSecondary, fontSize: typography.size.xs }]}>{chartMax}</Text>
            </View>
          </View>
        )}
      </Section>
    </ScrollView>
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

function EmptyHint({ text, colors, typography }: {
  text: string;
  colors: ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
}) {
  return (
    <View style={[styles.emptyHint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center' }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root:         { flex: 1 },
  content:      { padding: 16, paddingTop: 60, paddingBottom: 32, gap: 20 },
  section:      { gap: 8, alignItems: 'stretch' },
  sectionLabel: { letterSpacing: 0.5, fontWeight: '600', marginLeft: 2 },
  statsRow:     { flexDirection: 'row', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  statCell:     { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 2 },
  cellDivider:  { width: 1 },
  statValue:    { fontWeight: '700' },
  statLabel:    { textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  card:         { borderRadius: 12, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 10 },
  rowDivider:   { height: 1, marginVertical: 8 },
  tacticRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  tacticLabel:  { width: 110, fontWeight: '500' },
  tacticBarWrap:{ flex: 1 },
  tacticBarBg:  { height: 6, borderRadius: 3, overflow: 'hidden' },
  tacticBarFill:{ height: '100%', borderRadius: 3 },
  tacticMeta:   { width: 72, textAlign: 'right' },
  chartRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 4, height: 80 },
  barWrap:      { flex: 1, alignItems: 'center', gap: 2 },
  bar:          { width: '100%', borderRadius: 3 },
  barDate:      { textAlign: 'center' },
  chartLegend:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendText:   {},
  emptyHint:    { borderRadius: 12, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 16 },
});
