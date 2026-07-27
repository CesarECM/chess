import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Absolute overlay drawn on top of a past puzzle card.
 * - Solved: green tint + ✓
 * - Failed (viewed solution): red tint + ✗
 * - Skipped (no attempt): gray tint + →
 */
export function PastPuzzleOverlay({
  solved,
  skipped = false,
  height,
}: {
  solved: boolean;
  skipped?: boolean;
  height: number;
}) {
  const { colors } = useTheme();

  const bg          = solved ? colors.success + '50'
                    : skipped ? colors.textSecondary + '30'
                    : colors.error + '30';
  const badgeColor  = solved ? colors.success
                    : skipped ? colors.textSecondary
                    : colors.error;
  const badgeText   = solved ? '✓' : skipped ? '→' : '✗';

  return (
    <View
      style={[styles.overlay, { height, backgroundColor: bg }]}
      pointerEvents="none"
    >
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Text style={styles.badgeText}>{badgeText}</Text>
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
