import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import type { ChestContents } from '@/types';

const ITEM_ICONS: Record<string, string> = {
  medal:     '🥇',
  painting:  '🖼',
  sculpture: '🗿',
  trophy:    '🏆',
  board:     '♟',
  special:   '✨',
};

interface Props {
  contents: ChestContents | null;
  onClose:  () => void;
}

export function ChestOpenModal({ contents, onClose }: Props) {
  const { colors, typography } = useTheme();
  const { t } = useTranslation();

  if (!contents) return null;

  const isRare      = contents.isRare;
  const accentColor = isRare ? '#D4A017' : colors.accent;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[
          styles.modal,
          {
            backgroundColor: colors.background,
            borderColor: isRare ? '#D4A017' : colors.border,
            borderWidth: isRare ? 2 : 1,
          },
        ]}>
          {/* Header */}
          <Text style={[styles.rarity, { color: accentColor, fontSize: typography.size.sm }]}>
            {isRare ? t('chests.modal.rare') : t('chests.modal.common')}
          </Text>
          <Text style={[styles.title, { color: colors.text, fontSize: typography.size.xl }]}>
            {t('chests.modal.title')}
          </Text>

          {/* Cosmetics */}
          {contents.items.length > 0 && (
            <View style={styles.itemsSection}>
              {contents.items.map((item) => (
                <View key={item.id} style={[styles.itemRow, { borderColor: colors.border }]}>
                  <Text style={styles.itemEmoji}>{ITEM_ICONS[item.type] ?? '✨'}</Text>
                  <Text style={[styles.itemLabel, { color: colors.text, fontSize: typography.size.sm }]}>
                    {t(`reino.item.${item.type}`)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Bonuses */}
          {contents.lifeBonus > 0 && (
            <View style={[styles.bonusRow, { borderColor: colors.border }]}>
              <Text style={styles.bonusEmoji}>❤️</Text>
              <Text style={[styles.bonusText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('chests.modal.lifeBonus', { count: contents.lifeBonus })}
              </Text>
            </View>
          )}

          {contents.streakFreeze > 0 && (
            <View style={[styles.bonusRow, { borderColor: colors.border }]}>
              <Text style={styles.bonusEmoji}>🛡️</Text>
              <Text style={[styles.bonusText, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('chests.modal.streakFreeze', { count: contents.streakFreeze })}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: accentColor }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[styles.closeBtnText, { fontSize: typography.size.md }]}>
              {t('chests.modal.close')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal:        { width: '100%', maxWidth: 360, borderRadius: 20, padding: 24, gap: 14, alignItems: 'center' },
  rarity:       { fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title:        { fontWeight: '700', textAlign: 'center' },
  itemsSection: { width: '100%', gap: 8 },
  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  itemEmoji:    { fontSize: 22 },
  itemLabel:    { fontWeight: '600' },
  bonusRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, width: '100%' },
  bonusEmoji:   { fontSize: 20 },
  bonusText:    { fontWeight: '600' },
  closeBtn:     { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 4 },
  closeBtnText: { fontWeight: '700', color: '#fff' },
});
