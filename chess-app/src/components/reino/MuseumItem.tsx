import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import type { ItemType } from '@/constants/reino';

interface Props {
  itemId:   string;
  hallId:   string | null;
  itemType: ItemType;
  earnedAt: string;
}

const TYPE_ICON: Record<ItemType, string> = {
  medal:     '🥇',
  painting:  '🖼',
  sculpture: '🗿',
  trophy:    '🏆',
  board:     '♟',
  special:   '✨',
};

export function MuseumItem({ itemId, hallId, itemType, earnedAt }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  const dateStr = new Date(earnedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <View style={[styles.item, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={styles.icon}>{TYPE_ICON[itemType]}</Text>
      <Text style={[styles.label, { color: colors.text, fontSize: typography.size.xs }]} numberOfLines={1}>
        {t(`reino.item.${itemType}`)}
      </Text>
      {hallId && (
        <Text style={[styles.origin, { color: colors.textSecondary, fontSize: typography.size.xs }]} numberOfLines={1}>
          {t(`reino.hall.${hallId}`)}
        </Text>
      )}
      <Text style={[styles.date, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {dateStr}
      </Text>
      <Text style={{ display: 'none' }}>{itemId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item:   { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center', gap: 4, width: 80 },
  icon:   { fontSize: 28 },
  label:  { fontWeight: '600', textAlign: 'center' },
  origin: { textAlign: 'center' },
  date:   { textAlign: 'center' },
});
