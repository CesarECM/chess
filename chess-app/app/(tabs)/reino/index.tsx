import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useReinoStore } from '@/stores/useReinoStore';
import { useLigaStore } from '@/stores/useLigaStore';
import { HALLS, CROWN_COLORS } from '@/constants/reino';
import { HallCard } from '@/components/reino/HallCard';
import { ChestSlotGrid } from '@/components/reino/ChestSlotGrid';
import { ChestShop } from '@/components/reino/ChestShop';
import { ChestOpenModal } from '@/components/reino/ChestOpenModal';
import type { ChestContents } from '@/types';

export default function ReinoScreen() {
  const { colors, typography } = useTheme();
  const { t }      = useTranslation();
  const router     = useRouter();

  const [openedContents, setOpenedContents] = useState<ChestContents | null>(null);

  const crowns             = useReinoStore((s) => s.crowns);
  const crystals           = useReinoStore((s) => s.crystals);
  const speedPointsToday   = useReinoStore((s) => s.speedPointsToday);
  const lives              = useReinoStore((s) => s.lives);
  const hallProgress       = useReinoStore((s) => s.hallProgress);
  const crystalHallUnlocked = useReinoStore((s) => s.crystalHallUnlocked);

  const ligaCurrent = useLigaStore((s) => s.current);

  const normalHalls  = HALLS.filter((h) => !h.isCrystal);
  const crystalHall  = HALLS.find((h) => h.isCrystal)!;

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: colors.text, fontSize: typography.size.xl }]}>
        🏰 {t('reino.title')}
      </Text>

      {/* ── Stats row ── */}
      <View style={[styles.statsRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.statCell}>
          <View style={styles.crownsLine}>
            {(['gold', 'silver', 'bronze'] as const).map((type) => (
              <View key={type} style={styles.crownItem}>
                <View style={[styles.crownDot, { backgroundColor: CROWN_COLORS[type] }]} />
                <Text style={[styles.statValue, { color: colors.text, fontSize: typography.size.md }]}>
                  {crowns[type]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('reino.stat.crowns')}
          </Text>
        </View>

        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: colors.text, fontSize: typography.size.md }]}>
            💎 {crystals}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('reino.stat.crystals')}
          </Text>
        </View>

        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: colors.text, fontSize: typography.size.md }]}>
            ❤️ {lives.current}/{lives.max}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('reino.stat.lives')}
          </Text>
        </View>

        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />

        <View style={styles.statCell}>
          <Text style={[styles.statValue, { color: colors.text, fontSize: typography.size.md }]}>
            ⚡ {speedPointsToday}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('reino.stat.speed')}
          </Text>
        </View>
      </View>

      {/* ── Cofres ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('chests.section.slots')}
      </Text>
      <ChestSlotGrid onContentsReady={setOpenedContents} />

      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('chests.section.shop')}
      </Text>
      <ChestShop />

      {/* ── Liga semanal ── */}
      <TouchableOpacity
        style={[styles.ligaButton, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={() => router.push('/reino/liga')}
        activeOpacity={0.7}
      >
        <View style={styles.ligaLeft}>
          <Text style={{ fontSize: 20 }}>🏆</Text>
          <View>
            <Text style={[styles.ligaTitle, { color: colors.text, fontSize: typography.size.sm }]}>
              {t('liga.title')}
            </Text>
            <Text style={[styles.ligaSub, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
              {ligaCurrent
                ? t('liga.myRank', { rank: ligaCurrent.myRank, total: ligaCurrent.members.length })
                : t('liga.noLeague')}
            </Text>
          </View>
        </View>
        <Text style={[styles.ligaArrow, { color: colors.textSecondary }]}>›</Text>
      </TouchableOpacity>

      {/* ── Halls ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('reino.section.halls')}
      </Text>

      {normalHalls.map((hall) => (
        <HallCard
          key={hall.id}
          hall={hall}
          progress={hallProgress[hall.id]}
        />
      ))}

      {/* ── Crystal Hall ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('reino.section.crystal')}
      </Text>

      {crystalHallUnlocked ? (
        <HallCard
          hall={crystalHall}
          progress={hallProgress[crystalHall.id]}
        />
      ) : (
        <View style={[styles.crystalLocked, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={{ fontSize: 32 }}>❓</Text>
          <Text style={[styles.crystalLockedTitle, { color: colors.text, fontSize: typography.size.sm }]}>
            {t('reino.crystal.lockedTitle')}
          </Text>
          <Text style={[styles.crystalLockedBody, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
            {t('reino.crystal.lockedBody', { needed: 10 - lives.max })}
          </Text>
        </View>
      )}
    </ScrollView>

    <ChestOpenModal
      contents={openedContents}
      onClose={() => setOpenedContents(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1 },
  content:            { padding: 16, gap: 12, paddingBottom: 40 },
  title:              { fontWeight: '700', marginBottom: 4 },
  sectionTitle:       { fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 8 },
  statsRow:           { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  statCell:           { flex: 1, alignItems: 'center', gap: 4 },
  statDivider:        { width: 1, alignSelf: 'stretch' },
  statValue:          { fontWeight: '700' },
  statLabel:          { textAlign: 'center' },
  crownsLine:         { flexDirection: 'row', gap: 6, alignItems: 'center' },
  crownItem:          { flexDirection: 'row', alignItems: 'center', gap: 3 },
  crownDot:           { width: 8, height: 8, borderRadius: 4 },
  ligaButton:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  ligaLeft:           { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ligaTitle:          { fontWeight: '700' },
  ligaSub:            { marginTop: 2 },
  ligaArrow:          { fontSize: 22, fontWeight: '300' },
  crystalLocked:      { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: 'center', gap: 8, borderStyle: 'dashed' },
  crystalLockedTitle: { fontWeight: '700', textAlign: 'center' },
  crystalLockedBody:  { textAlign: 'center', lineHeight: 18 },
});
