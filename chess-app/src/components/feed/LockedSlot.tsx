import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  height: number;
  isLoading?: boolean;
  onNext?: () => void;
  onGoToPuzzle?: () => void;
}

const LIGHT_SQUARE = '#f0d9b5';
const DARK_SQUARE  = '#b58863';

function BoardPreview({ size }: { size: number }) {
  const cellSize = size / 8;
  return (
    <View style={{ width: size, height: size, flexDirection: 'column' }}>
      {Array.from({ length: 8 }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {Array.from({ length: 8 }).map((_, c) => (
            <View
              key={c}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: (r + c) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function LockedSlot({ height, isLoading = false, onNext, onGoToPuzzle }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { t } = useTranslation();
  const boardSize = Math.min(height * 0.55, 400);

  if (isLoading) {
    return (
      <View style={[styles.container, { height, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { height, backgroundColor: colors.background }]}>
      {/* Blurred board preview */}
      <View style={[styles.boardWrapper, { width: boardSize, height: boardSize }]}>
        <View style={Platform.OS === 'web' ? ({ filter: 'blur(10px)' } as ViewStyle) : undefined}>
          <BoardPreview size={boardSize} />
        </View>
        <View style={[StyleSheet.absoluteFill, styles.boardOverlay]} />
        <View style={[StyleSheet.absoluteFill, styles.lockCenter]}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={[styles.btnGroup, { gap: spacing[3] }]}>
        {onNext && (
          <TouchableOpacity
            onPress={onNext}
            style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.accent, borderRadius: 10 }]}
          >
            <Text style={[styles.btnText, { color: '#fff', fontSize: typography.size.md }]}>
              {t('feed.viewPuzzle')}
            </Text>
          </TouchableOpacity>
        )}
        {onGoToPuzzle && (
          <TouchableOpacity
            onPress={onGoToPuzzle}
            style={[styles.btn, styles.btnSecondary, { borderColor: colors.textSecondary + '60', borderRadius: 10 }]}
          >
            <Text style={[styles.btnText, { color: colors.textSecondary, fontSize: typography.size.sm }]}>
              {t('feed.goToPuzzle')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { alignItems: 'center', justifyContent: 'center', gap: 28 },
  boardWrapper: { position: 'relative', overflow: 'hidden' },
  boardOverlay: { backgroundColor: 'rgba(0,0,0,0.62)' },
  lockCenter:   { alignItems: 'center', justifyContent: 'center' },
  lockIcon:     { fontSize: 52 },
  btnGroup:     { alignItems: 'center' },
  btn:          { paddingHorizontal: 28, paddingVertical: 12 },
  btnPrimary:   {},
  btnSecondary: { borderWidth: 1, marginTop: 4 },
  btnText:      { fontWeight: '600' },
});
