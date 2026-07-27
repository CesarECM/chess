import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Absolute overlay drawn on top of a past puzzle card.
 * Shows a green tint + ✓ for solved puzzles, gray tint + ✗ otherwise.
 */
export function PastPuzzleOverlay({ solved, height }: { solved: boolean; height: number }) {
  const { colors } = useTheme();
  const bg = solved ? colors.success + '50' : colors.textSecondary + '40';

  return (
    <View
      style={[styles.overlay, { height, backgroundColor: bg }]}
      pointerEvents="none"
    >
      <View style={[styles.badge, { backgroundColor: solved ? colors.success : colors.textSecondary }]}>
        <Text style={styles.badgeText}>{solved ? '✓' : '✗'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  badgeText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '700',
  },
});
