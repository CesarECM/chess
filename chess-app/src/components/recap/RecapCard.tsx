import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/stores/useUserStore';
import { useReinoStore } from '@/stores/useReinoStore';
import { HALLS } from '@/constants/reino';
import type { HallId, HallProgressEntry } from '@/constants/reino';

// Fixed branded colors — card always looks the same regardless of app theme
const CARD_BG      = '#0f172a';
const CARD_ACCENT  = '#f59e0b';
const CARD_TEXT    = '#f1f5f9';
const CARD_MUTED   = '#94a3b8';
const CARD_SURFACE = '#1e293b';

function getDominantHallName(
  hallProgress: Partial<Record<HallId, HallProgressEntry>>,
  t: (k: string) => string,
): string {
  const entries = Object.entries(hallProgress) as [HallId, HallProgressEntry][];
  if (entries.length === 0) return '—';
  const best = entries.reduce((a, b) => (a[1].puzzlesCount > b[1].puzzlesCount ? a : b));
  return t(`reino.hall.${best[0]}`);
}

function getCurrentMonthLabel(locale: string): string {
  return new Date().toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export const RecapCard = forwardRef<View>((_, ref) => {
  const { t, i18n } = useTranslation();

  const puzzlesCompleted = useUserStore((s) => s.puzzlesCompleted);
  const puzzlesFailed    = useUserStore((s) => s.puzzlesFailed);
  const streakDays       = useUserStore((s) => s.streakDays);
  const hallProgress     = useReinoStore((s) => s.hallProgress);
  const crowns           = useReinoStore((s) => s.crowns);

  const total      = puzzlesCompleted + puzzlesFailed;
  const accuracy   = total > 0 ? Math.round((puzzlesCompleted / total) * 100) : 0;
  const topHall    = getDominantHallName(hallProgress, t);
  const monthLabel = getCurrentMonthLabel(i18n.language);
  const goldTotal  = crowns.gold + crowns.silver + crowns.bronze;

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.piece}>♟</Text>
        <View>
          <Text style={styles.appName}>Chess Puzzles</Text>
          <Text style={styles.month}>{monthLabel}</Text>
        </View>
      </View>

      {/* Main stat */}
      <View style={[styles.mainStat, { backgroundColor: CARD_SURFACE }]}>
        <Text style={styles.mainValue}>{puzzlesCompleted.toLocaleString()}</Text>
        <Text style={styles.mainLabel}>{t('recap.puzzlesSolved')}</Text>
      </View>

      {/* Secondary stats grid */}
      <View style={styles.grid}>
        <View style={[styles.gridCell, { backgroundColor: CARD_SURFACE }]}>
          <Text style={[styles.gridValue, { color: CARD_ACCENT }]}>{accuracy}%</Text>
          <Text style={styles.gridLabel}>{t('recap.accuracy')}</Text>
        </View>
        <View style={[styles.gridCell, { backgroundColor: CARD_SURFACE }]}>
          <Text style={[styles.gridValue, { color: '#f87171' }]}>🔥 {streakDays}</Text>
          <Text style={styles.gridLabel}>{t('recap.streakLabel')}</Text>
        </View>
      </View>

      {/* Hall + crowns */}
      <View style={[styles.hallRow, { backgroundColor: CARD_SURFACE }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hallName}>{topHall !== '—' ? `🏰 ${topHall}` : '🏰 —'}</Text>
          <Text style={styles.gridLabel}>{t('recap.topHall')}</Text>
        </View>
        <View style={styles.crownsGroup}>
          <Text style={[styles.gridValue, { color: '#fbbf24' }]}>♛ {goldTotal}</Text>
          <Text style={styles.gridLabel}>{t('recap.crowns')}</Text>
        </View>
      </View>

      {/* Footer */}
      <Text style={styles.footer}>chess-puzzles.app</Text>
    </View>
  );
});

RecapCard.displayName = 'RecapCard';

const styles = StyleSheet.create({
  card:       { width: 360, backgroundColor: CARD_BG, borderRadius: 20, padding: 24, gap: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  piece:      { fontSize: 36, color: CARD_ACCENT },
  appName:    { color: CARD_TEXT, fontSize: 18, fontWeight: '800' },
  month:      { color: CARD_MUTED, fontSize: 13, marginTop: 2 },
  mainStat:   { borderRadius: 14, paddingVertical: 20, alignItems: 'center', gap: 4 },
  mainValue:  { color: CARD_TEXT, fontSize: 52, fontWeight: '800', lineHeight: 56 },
  mainLabel:  { color: CARD_MUTED, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  grid:       { flexDirection: 'row', gap: 12 },
  gridCell:   { flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 4 },
  gridValue:  { fontSize: 24, fontWeight: '800' },
  gridLabel:  { color: CARD_MUTED, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  hallRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  hallName:   { color: CARD_TEXT, fontSize: 16, fontWeight: '700' },
  crownsGroup:{ alignItems: 'center', gap: 4 },
  footer:     { color: CARD_MUTED, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
