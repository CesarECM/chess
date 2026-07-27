import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Shown in place of future feed items — prevents peeking at unseen puzzles/cards.
 * A dark full-height placeholder with a faint chess icon.
 */
export function FuturePlaceholder({ height }: { height: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.future, { height, backgroundColor: colors.background }]}>
      <Text style={[styles.futureIcon, { color: colors.text }]}>♟</Text>
    </View>
  );
}

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
  future: {
    alignItems: 'center',
    justifyContent: 'center',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...Platform.select({ web: { filter: 'blur(6px)' } as any }),
  },
  futureIcon: {
    fontSize: 96,
    opacity: 0.06,
  },
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
