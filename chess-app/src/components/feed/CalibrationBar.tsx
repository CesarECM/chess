import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  startLow:    number;
  startHigh:   number;
  currentLow:  number;
  currentHigh: number;
}

const BAR_H = 10;

export function CalibrationBar({ startLow, startHigh, currentLow, currentHigh }: Props) {
  const { colors } = useTheme();

  const startRange = Math.max(1, startHigh - startLow);
  const leftFrac   = (currentLow  - startLow)  / startRange;
  const rightFrac  = (startHigh   - currentHigh) / startRange;

  const [trackW, setTrackW] = useState(0);
  const leftAnim       = useRef(new Animated.Value(0)).current;
  const rightAnim      = useRef(new Animated.Value(0)).current;
  const isFirstLayout  = useRef(true);

  useEffect(() => {
    if (trackW === 0) return;
    const targetLeft  = trackW * leftFrac;
    const targetRight = trackW * rightFrac;

    if (isFirstLayout.current) {
      isFirstLayout.current = false;
      leftAnim.setValue(targetLeft);
      rightAnim.setValue(targetRight);
      return;
    }

    Animated.parallel([
      Animated.spring(leftAnim,  { toValue: targetLeft,  useNativeDriver: false, damping: 20, stiffness: 200 }),
      Animated.spring(rightAnim, { toValue: targetRight, useNativeDriver: false, damping: 20, stiffness: 200 }),
    ]).start();
  }, [leftFrac, rightFrac, trackW]);

  return (
    <View
      style={[styles.track, { backgroundColor: colors.accent + '28' }]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.active,
          { left: leftAnim, right: rightAnim, backgroundColor: colors.accent },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: BAR_H,
    borderRadius: BAR_H / 2,
    overflow: 'hidden',
  },
  active: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
