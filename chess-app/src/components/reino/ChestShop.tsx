import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { useReinoStore } from '@/stores/useReinoStore';
import { CHEST_DEFS, CHEST_SLOT_MAX } from '@/constants/chests';
import { CROWN_COLORS } from '@/constants/reino';
import type { ChestType } from '@/types';

const CHEST_TYPES: ChestType[] = ['wood', 'silver', 'gold'];

interface ChestCardProps {
  type:       ChestType;
  slotsLeft:  number;
  canAfford:  boolean;
  onBuy:      (type: ChestType) => void;
  colors:     ReturnType<typeof useTheme>['colors'];
  typography: ReturnType<typeof useTheme>['typography'];
  t:          ReturnType<typeof useTranslation>['t'];
}

function ChestCard({ type, slotsLeft, canAfford, onBuy, colors, typography, t }: ChestCardProps) {
  const def      = CHEST_DEFS[type];
  const disabled = slotsLeft === 0 || !canAfford;

  const costParts: string[] = [];
  if (def.cost.bronze > 0) costParts.push(`${def.cost.bronze}●`);
  if (def.cost.silver > 0) costParts.push(`${def.cost.silver}●`);
  if (def.cost.gold   > 0) costParts.push(`${def.cost.gold}●`);

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Text style={styles.emoji}>{def.emoji}</Text>
      <Text style={[styles.name, { color: colors.text, fontSize: typography.size.xs }]}>
        {t(`chests.type.${type}`)}
      </Text>

      {/* Cost */}
      <View style={styles.costRow}>
        {def.cost.bronze > 0 && (
          <Text style={[styles.costBadge, { color: CROWN_COLORS.bronze, fontSize: typography.size.xs }]}>
            {def.cost.bronze}●
          </Text>
        )}
        {def.cost.silver > 0 && (
          <Text style={[styles.costBadge, { color: CROWN_COLORS.silver, fontSize: typography.size.xs }]}>
            {def.cost.silver}●
          </Text>
        )}
        {def.cost.gold > 0 && (
          <Text style={[styles.costBadge, { color: CROWN_COLORS.gold, fontSize: typography.size.xs }]}>
            {def.cost.gold}●
          </Text>
        )}
      </View>

      <Text style={[styles.timer, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        ⏱ {def.timerHours}h
      </Text>

      <TouchableOpacity
        style={[
          styles.buyBtn,
          { backgroundColor: disabled ? colors.border : colors.accent },
        ]}
        onPress={() => onBuy(type)}
        disabled={disabled}
        activeOpacity={0.75}
      >
        <Text style={[styles.buyBtnText, { fontSize: typography.size.xs }]}>
          {slotsLeft === 0
            ? t('chests.shop.full')
            : !canAfford
            ? t('chests.shop.noFunds')
            : t('chests.shop.buy')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function ChestShop() {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const crowns   = useReinoStore((s) => s.crowns);
  const chests   = useReinoStore((s) => s.chests);
  const buyChest = useReinoStore((s) => s.buyChest);

  const slotsLeft = CHEST_SLOT_MAX - chests.length;

  function canAfford(type: ChestType): boolean {
    const { cost } = CHEST_DEFS[type];
    return (
      crowns.bronze >= cost.bronze &&
      crowns.silver >= cost.silver &&
      crowns.gold   >= cost.gold
    );
  }

  return (
    <View style={styles.row}>
      {CHEST_TYPES.map((type) => (
        <ChestCard
          key={type}
          type={type}
          slotsLeft={slotsLeft}
          canAfford={canAfford(type)}
          onBuy={buyChest}
          colors={colors}
          typography={typography}
          t={t}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row:         { flexDirection: 'row', gap: 8 },
  card:        { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 5 },
  emoji:       { fontSize: 26 },
  name:        { fontWeight: '600', textAlign: 'center' },
  costRow:     { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' },
  costBadge:   { fontWeight: '700' },
  timer:       { fontWeight: '500' },
  buyBtn:      { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, marginTop: 2, width: '100%', alignItems: 'center' },
  buyBtnText:  { fontWeight: '700', color: '#fff' },
});
