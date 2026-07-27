import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface Props {
  delta: number;
  onAnimationEnd: () => void;
}

export function EloDeltaBadge({ delta, onAnimationEnd }: Props) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1,   duration: 150, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -12, duration: 150, useNativeDriver: true }),
      ]),
      Animated.delay(900),
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0,   duration: 280, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -52, duration: 280, useNativeDriver: true }),
      ]),
    ]).start(() => onAnimationEnd());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sign  = delta >= 0 ? '+' : '';
  const color = delta >= 0 ? '#4CAF50' : '#EF5350';

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[styles.badge, { opacity, transform: [{ translateY }] }]}>
        <Text style={[styles.text, { color }]}>{sign}{delta}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  text: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
