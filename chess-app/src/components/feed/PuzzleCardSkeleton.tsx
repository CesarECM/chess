import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  height: number;
}

export function PuzzleCardSkeleton({ height }: Props) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
    return () => { opacity.stopAnimation(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bg = colors.surfaceAlt;

  return (
    <View
      style={[styles.container, { height, backgroundColor: colors.background }]}
      accessibilityRole="progressbar"
    >
      <Animated.View style={{ opacity, flex: 1, paddingHorizontal: 16, paddingVertical: 20, gap: 12 }}>
        {/* Board placeholder ~55% of height */}
        <View style={[styles.board, { height: height * 0.55, backgroundColor: bg, borderRadius: 8 }]} />
        {/* Status bar */}
        <View style={[styles.barStatus, { backgroundColor: bg }]} />
        {/* Button bar */}
        <View style={[styles.barButton, { backgroundColor: bg }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1 },
  board:      { width: '100%' },
  barStatus:  { height: 20, borderRadius: 6, width: '60%', alignSelf: 'center' },
  barButton:  { height: 44, borderRadius: 8 },
});
