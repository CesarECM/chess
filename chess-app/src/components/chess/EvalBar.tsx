import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface EvalBarProps {
  cp: number | null;
  mate: number | null;
}

function whiteAdvantage(cp: number | null, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 0.97 : 0.03;
  if (cp === null) return 0.5;
  return 0.5 + 0.5 * Math.tanh(cp / 600);
}

function evalLabel(cp: number | null, mate: number | null): string {
  if (mate !== null) return mate > 0 ? `M${mate}` : `M${-mate}`;
  if (cp === null || Math.abs(cp) < 15) return '=';
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}

export function EvalBar({ cp, mate }: EvalBarProps) {
  const advAnim = useRef(new Animated.Value(0.5)).current;
  const adv = whiteAdvantage(cp, mate);

  useEffect(() => {
    Animated.timing(advAnim, {
      toValue: adv,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [adv, advAnim]);

  const label = evalLabel(cp, mate);
  const whiteIsBetter = adv >= 0.5;

  return (
    <View style={styles.bar}>
      {/* Dark section (black) — top */}
      <View style={[styles.half, styles.dark]} />
      {/* White overlay from bottom — grows as white advantage increases */}
      <Animated.View
        style={[
          styles.white,
          {
            height: advAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
      <Text style={[styles.label, { color: whiteIsBetter ? '#222' : '#eee', top: whiteIsBetter ? undefined : 4, bottom: whiteIsBetter ? 4 : undefined }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 14,
    alignSelf: 'stretch',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1a1a1a',
    marginRight: 6,
  },
  half: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  dark: {
    backgroundColor: '#1a1a1a',
  },
  white: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f0ede8',
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 7,
    fontWeight: '700',
    zIndex: 1,
  },
});
