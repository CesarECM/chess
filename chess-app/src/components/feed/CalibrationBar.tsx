import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface Props {
  startLow:    number;
  startHigh:   number;
  currentLow:  number;
  currentHigh: number;
}

const BAR_H       = 6;
const DOT_SIZE    = 12;
const RIPPLE_SIZE = 12;
const WRAPPER_H   = 36;

const COLOR_COLLAPSED = '#B8B8B8';
const COLOR_BAR_START = '#A07070';
const COLOR_BAR_END   = '#22c55e';
const COLOR_DOT_OFF   = '#2a2a2a';
const COLOR_DOT_ON    = '#22c55e';

const SPRING = { useNativeDriver: false, damping: 20, stiffness: 200 } as const;

export function CalibrationBar({ startLow, startHigh, currentLow, currentHigh }: Props) {
  const startRange   = Math.max(1, startHigh - startLow);
  const currentRange = currentHigh - currentLow;
  const progress     = Math.max(0, Math.min(1, 1 - currentRange / startRange));
  const leftFrac     = (currentLow - startLow) / startRange;
  const rightFrac    = (startHigh - currentHigh) / startRange;
  const midFrac      = ((currentLow + currentHigh) / 2 - startLow) / startRange;

  const [trackW, setTrackW] = useState(0);
  const leftAnim      = useRef(new Animated.Value(0)).current;
  const rightAnim     = useRef(new Animated.Value(0)).current;
  const dotCenterAnim = useRef(new Animated.Value(0)).current;
  const progressAnim  = useRef(new Animated.Value(0)).current;
  const rippleScale   = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0.9)).current;
  const isFirstLayout = useRef(true);

  // Position & progress animations
  useEffect(() => {
    if (trackW === 0) return;
    const targetLeft   = trackW * leftFrac;
    const targetRight  = trackW * rightFrac;
    const targetCenter = trackW * midFrac;

    if (isFirstLayout.current) {
      isFirstLayout.current = false;
      leftAnim.setValue(targetLeft);
      rightAnim.setValue(targetRight);
      dotCenterAnim.setValue(targetCenter);
      progressAnim.setValue(progress);
      return;
    }

    Animated.parallel([
      Animated.spring(leftAnim,      { toValue: targetLeft,   ...SPRING }),
      Animated.spring(rightAnim,     { toValue: targetRight,  ...SPRING }),
      Animated.spring(dotCenterAnim, { toValue: targetCenter, ...SPRING }),
      Animated.spring(progressAnim,  { toValue: progress,     ...SPRING }),
    ]).start();
  }, [leftFrac, rightFrac, midFrac, progress, trackW]);

  // Ripple loop
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(rippleScale,   { toValue: 2.8, duration: 1600, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0,   duration: 1600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(rippleScale,   { toValue: 1,   duration: 0, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0.9, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const barColor = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [COLOR_BAR_START, COLOR_BAR_END],
    extrapolate: 'clamp',
  });
  const dotColor = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [COLOR_DOT_OFF, COLOR_DOT_ON],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      {/* Track con zona activa coloreada y colapsados en gris */}
      <View style={[styles.track, { backgroundColor: COLOR_COLLAPSED }]}>
        <Animated.View
          style={[styles.active, { left: leftAnim, right: rightAnim, backgroundColor: barColor }]}
        />
      </View>

      {/* Puntito + onda — fuera del overflow:hidden del track */}
      <Animated.View style={[styles.dotAnchor, { left: dotCenterAnim }]}>
        <Animated.View
          style={[styles.ripple, {
            borderColor: dotColor,
            transform:   [{ scale: rippleScale }],
            opacity:     rippleOpacity,
          }]}
        />
        <Animated.View style={[styles.dot, { backgroundColor: dotColor }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height:   WRAPPER_H,
    overflow: 'visible',
  },
  track: {
    position:     'absolute',
    left: 0, right: 0,
    top:          (WRAPPER_H - BAR_H) / 2,
    height:       BAR_H,
    borderRadius: BAR_H / 2,
    overflow:     'hidden',
  },
  active: {
    position: 'absolute',
    top: 0, bottom: 0,
  },
  dotAnchor: {
    position: 'absolute',
    top:      WRAPPER_H / 2,
  },
  ripple: {
    position:     'absolute',
    width:        RIPPLE_SIZE,
    height:       RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
    borderWidth:  1.5,
    left:         -(RIPPLE_SIZE / 2),
    top:          -(RIPPLE_SIZE / 2),
  },
  dot: {
    position:     'absolute',
    width:        DOT_SIZE,
    height:       DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    left:         -(DOT_SIZE / 2),
    top:          -(DOT_SIZE / 2),
  },
});
