import { useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLigaStore } from '@/stores/useLigaStore';
import { fetchAndSetLeaderboard, checkPreviousWeekResult } from '@/services/liga';
import type { LeagueMember } from '@/stores/useLigaStore';
import { ELO_RANGES } from '@/constants';

// ELO piece symbol helper
function eloPiece(elo: number): string {
  const ranges = Object.values(ELO_RANGES) as { min: number; max: number; piece: string }[];
  const range  = [...ranges].reverse().find((r) => elo >= r.min);
  return range?.piece ?? '♟';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function LeaderboardRow({
  member,
  isPromo,
  isDemotion,
  colors,
  typography,
  t,
}: {
  member:      LeagueMember;
  isPromo:     boolean;
  isDemotion:  boolean;
  colors:      any;
  typography:  any;
  t:           (k: string, o?: any) => string;
}) {
  const bg = isPromo
    ? 'rgba(34,197,94,0.10)'
    : isDemotion
    ? 'rgba(239,68,68,0.10)'
    : 'transparent';

  return (
    <View style={[styles.row, { backgroundColor: bg, borderColor: member.isMe ? colors.accent : colors.border }]}>
      <Text style={[styles.rowRank, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
        #{member.rank}
      </Text>
      <Text style={[styles.rowPiece, { fontSize: typography.size.md }]}>
        {eloPiece(member.elo)}
      </Text>
      <Text style={[styles.rowName, { color: colors.text, fontSize: typography.size.sm }]}>
        {member.isMe ? t('liga.you') : `${eloPiece(member.elo)} ${member.rank}`}
      </Text>
      <Text style={[styles.rowScore, { color: member.isMe ? colors.accent : colors.text, fontSize: typography.size.sm }]}>
        {t('liga.score', { count: member.puzzlesWeek })}
      </Text>
    </View>
  );
}

export default function LigaScreen() {
  const { colors, typography } = useTheme();
  const { t }    = useTranslation();
  const router   = useRouter();
  const userId   = useAuthStore((s) => s.user?.id ?? '');

  const current        = useLigaStore((s) => s.current);
  const previousResult = useLigaStore((s) => s.previousResult);
  const resultSeen     = useLigaStore((s) => s.resultSeen);
  const loading        = useLigaStore((s) => s.loading);
  const markResultSeen = useLigaStore((s) => s.markResultSeen);

  useEffect(() => {
    if (userId) {
      fetchAndSetLeaderboard();
      checkPreviousWeekResult(userId);
    }
  }, [userId]);

  const members   = current?.members ?? [];
  const total     = members.length;
  const promoZone = Math.max(1, Math.floor(total / 5));
  const demoZone  = Math.max(1, Math.floor(total / 5));

  // Build display list: top 5 + my row (if outside top/bottom 5) + bottom 5
  const top5    = members.slice(0, Math.min(5, total));
  const bottom5 = total > 5 ? members.slice(Math.max(5, total - 5)) : [];
  const myMember = members.find((m) => m.isMe);
  const myInTop5    = myMember ? myMember.rank <= 5 : false;
  const myInBottom5 = myMember ? myMember.rank > total - 5 : false;
  const showMyRow   = myMember && !myInTop5 && !myInBottom5;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.back, { color: colors.accent, fontSize: typography.size.md }]}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: typography.size.md }]}>
          🏆 {t('liga.title')}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Previous week result banner */}
        {previousResult && !resultSeen && (
          <View style={[styles.resultBanner, {
            borderColor: previousResult.promoted ? '#22c55e' : previousResult.demoted ? '#ef4444' : colors.border,
            backgroundColor: previousResult.promoted
              ? 'rgba(34,197,94,0.08)'
              : previousResult.demoted
              ? 'rgba(239,68,68,0.08)'
              : colors.background,
          }]}>
            <Text style={[styles.resultEmoji, { fontSize: 28 }]}>
              {previousResult.promoted ? '🎉' : previousResult.demoted ? '📉' : '📊'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('liga.result.title')}
              </Text>
              <Text style={[styles.resultBody, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                {t('liga.result.rank', { rank: previousResult.rank, total: previousResult.total })}
                {' · '}
                {previousResult.promoted
                  ? t('liga.result.promoted')
                  : previousResult.demoted
                  ? t('liga.result.demoted')
                  : t('liga.result.neutral')}
              </Text>
            </View>
            <TouchableOpacity onPress={markResultSeen} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[{ color: colors.textSecondary, fontSize: typography.size.lg }]}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Week range */}
        {current && (
          <Text style={[styles.weekRange, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('liga.week', { start: formatDate(current.weekStart), end: formatDate(current.weekEnd) })}
          </Text>
        )}

        {/* Loading */}
        {loading && !current && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[{ color: colors.textSecondary, fontSize: typography.size.sm, marginTop: 8 }]}>
              {t('liga.loading')}
            </Text>
          </View>
        )}

        {/* No league yet */}
        {!loading && !current && (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Text style={{ fontSize: 32 }}>🏆</Text>
            <Text style={[styles.emptyTitle, { color: colors.text, fontSize: typography.size.sm }]}>
              {t('liga.noLeague')}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {t('liga.noLeagueHint')}
            </Text>
          </View>
        )}

        {/* Leaderboard */}
        {current && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {t('liga.promotion')} · {t('liga.score', { count: promoZone })} {t('liga.topSpots')}
            </Text>

            {top5.map((m) => (
              <LeaderboardRow
                key={m.memberId}
                member={m}
                isPromo={m.rank <= promoZone}
                isDemotion={false}
                colors={colors}
                typography={typography}
                t={t}
              />
            ))}

            {/* My row if in the middle */}
            {showMyRow && myMember && (
              <>
                <Text style={[styles.ellipsis, { color: colors.textSecondary }]}>· · ·</Text>
                <LeaderboardRow
                  key={myMember.memberId}
                  member={myMember}
                  isPromo={false}
                  isDemotion={false}
                  colors={colors}
                  typography={typography}
                  t={t}
                />
                <Text style={[styles.ellipsis, { color: colors.textSecondary }]}>· · ·</Text>
              </>
            )}

            {/* Bottom 5 */}
            {bottom5.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
                  {t('liga.demotion')}
                </Text>
                {bottom5.map((m) => (
                  <LeaderboardRow
                    key={m.memberId}
                    member={m}
                    isPromo={false}
                    isDemotion={m.rank > total - demoZone}
                    colors={colors}
                    typography={typography}
                    t={t}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back:         { fontWeight: '500' },
  headerTitle:  { fontWeight: '700' },
  content:      { padding: 16, gap: 10, paddingBottom: 40 },
  weekRange:    { textAlign: 'center', marginBottom: 4 },
  sectionLabel: { fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  rowRank:      { width: 32, fontWeight: '700', textAlign: 'center' },
  rowPiece:     { width: 24, textAlign: 'center' },
  rowName:      { flex: 1 },
  rowScore:     { fontWeight: '700' },
  ellipsis:     { textAlign: 'center', letterSpacing: 4, paddingVertical: 2 },
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  resultEmoji:  {},
  resultTitle:  { fontWeight: '700' },
  resultBody:   { marginTop: 2, lineHeight: 16 },
  emptyBox:     { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: 'center', gap: 8, borderStyle: 'dashed' },
  emptyTitle:   { fontWeight: '700', textAlign: 'center' },
  emptyBody:    { textAlign: 'center', lineHeight: 18 },
  centered:     { alignItems: 'center', paddingVertical: 40 },
});
