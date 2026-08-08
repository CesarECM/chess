import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useReinoStore } from '@/stores/useReinoStore';
import { CHEST_DEFS, CHEST_SLOT_MAX } from '@/constants/chests';
import type { ChestContents, ChestSlot } from '@/types';

interface Props {
  onContentsReady: (contents: ChestContents) => void;
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface SlotCardProps {
  slot:            ChestSlot;
  now:             number;
  crystals:        number;
  onOpen:          (id: string) => void;
  onOpenNow:       (id: string) => void;
  colors:          ReturnType<typeof useTheme>['colors'];
  typography:      ReturnType<typeof useTheme>['typography'];
  t:               ReturnType<typeof useTranslation>['t'];
}

function SlotCard({ slot, now, crystals, onOpen, onOpenNow, colors, typography, t }: SlotCardProps) {
  const def       = CHEST_DEFS[slot.type];
  const remaining = Math.max(0, new Date(slot.unlockAt).getTime() - now);
  const isReady   = remaining === 0;
  const openCost  = def.openNowCrystals(remaining / 3_600_000);
  const canOpenNow = crystals >= openCost;

  return (
    <View style={[styles.slot, { borderColor: isReady ? colors.accent : colors.border, backgroundColor: colors.background }]}>
      <Text style={styles.chestEmoji}>{def.emoji}</Text>
      <Text style={[styles.chestName, { color: colors.text, fontSize: typography.size.xs }]}>
        {t(`chests.type.${slot.type}`)}
      </Text>

      {isReady ? (
        <TouchableOpacity
          style={[styles.openBtn, { backgroundColor: colors.accent }]}
          onPress={() => onOpen(slot.id)}
          activeOpacity={0.75}
        >
          <Text style={[styles.openBtnText, { fontSize: typography.size.xs }]}>
            {t('chests.slot.open')}
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text style={[styles.countdown, { color: colors.text, fontSize: typography.size.xs }]}>
            {formatCountdown(remaining)}
          </Text>
          <TouchableOpacity
            style={[
              styles.openNowBtn,
              { borderColor: canOpenNow ? colors.accent : colors.border },
            ]}
            onPress={() => onOpenNow(slot.id)}
            activeOpacity={canOpenNow ? 0.75 : 1}
            disabled={!canOpenNow}
          >
            <Text style={[styles.openNowText, { color: canOpenNow ? colors.accent : colors.textSecondary, fontSize: typography.size.xs }]}>
              💎 {openCost}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function EmptySlot({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.slot, styles.slotEmpty, { borderColor: colors.border }]}>
      <Text style={[styles.emptyIcon, { color: colors.border }]}>＋</Text>
    </View>
  );
}

export function ChestSlotGrid({ onContentsReady }: Props) {
  const { colors, typography } = useTheme();
  const { t }    = useTranslation();
  const chests   = useReinoStore((s) => s.chests);
  const crystals = useReinoStore((s) => s.crystals);
  const openChest        = useReinoStore((s) => s.openChest);
  const reduceChestTimer = useReinoStore((s) => s.reduceChestTimer);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  function handleOpen(id: string) {
    const contents = openChest(id, false);
    if (contents) onContentsReady(contents);
  }

  function handleOpenNow(id: string) {
    const slot = chests.find((c) => c.id === id);
    if (!slot) return;
    const def         = CHEST_DEFS[slot.type];
    const remaining   = Math.max(0, new Date(slot.unlockAt).getTime() - Date.now());
    const crystalCost = def.openNowCrystals(remaining / 3_600_000);
    const reduced     = reduceChestTimer(id, crystalCost);
    if (reduced) {
      const contents = openChest(id, true);
      if (contents) onContentsReady(contents);
    }
  }

  const emptyCount = CHEST_SLOT_MAX - chests.length;

  return (
    <View style={styles.grid}>
      {chests.map((slot) => (
        <SlotCard
          key={slot.id}
          slot={slot}
          now={now}
          crystals={crystals}
          onOpen={handleOpen}
          onOpenNow={handleOpenNow}
          colors={colors}
          typography={typography}
          t={t}
        />
      ))}
      {Array.from({ length: emptyCount }).map((_, i) => (
        <EmptySlot key={`empty-${i}`} colors={colors} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid:        { flexDirection: 'row', gap: 8 },
  slot:        { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 6, minHeight: 110 },
  slotEmpty:   { borderStyle: 'dashed', justifyContent: 'center' },
  emptyIcon:   { fontSize: 24 },
  chestEmoji:  { fontSize: 28 },
  chestName:   { fontWeight: '600', textAlign: 'center' },
  countdown:   { fontWeight: '700', fontVariant: ['tabular-nums'] },
  openBtn:     { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, marginTop: 2 },
  openBtnText: { fontWeight: '700', color: '#fff' },
  openNowBtn:  { borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, marginTop: 2 },
  openNowText: { fontWeight: '600' },
});
