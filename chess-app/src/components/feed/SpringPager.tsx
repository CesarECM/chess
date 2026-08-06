import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

export interface SpringPagerRef {
  scrollToIndex: (index: number, animated?: boolean) => void;
}

interface SpringPagerProps {
  itemHeight: number;
  itemCount: number;
  enabled: boolean;
  onIndexChange: (index: number) => void;
  onOverscrollDown?: () => void;
  children: ReactNode;
}

const SPRING_CONFIG  = { damping: 20, stiffness: 200, mass: 0.8 } as const;
const DIST_RATIO     = 0.25;  // 25 % of item height to commit a page turn
const VEL_THRESHOLD  = 400;   // px/s — fast swipe always commits

export const SpringPager = forwardRef<SpringPagerRef, SpringPagerProps>(
  ({ itemHeight, itemCount, enabled, onIndexChange, onOverscrollDown, children }, ref) => {
    const translateY   = useSharedValue(0);
    const activeIdxSV  = useSharedValue(0);
    const itemCountSV  = useSharedValue(itemCount);
    const itemHeightSV = useSharedValue(itemHeight);

    // Keep shared values in sync with props
    useEffect(() => { itemCountSV.value = itemCount; }, [itemCount, itemCountSV]);

    useEffect(() => {
      itemHeightSV.value = itemHeight;
      // Re-snap to current page immediately on resize — no animation
      translateY.value = -activeIdxSV.value * itemHeight;
    }, [itemHeight, activeIdxSV, itemHeightSV, translateY]);

    useImperativeHandle(ref, () => ({
      scrollToIndex(index: number, animated = true) {
        activeIdxSV.value = index;
        const target = -index * itemHeightSV.value;
        translateY.value = animated ? withSpring(target, SPRING_CONFIG) : target;
        onIndexChange(index);
      },
    }), [activeIdxSV, itemHeightSV, translateY, onIndexChange]);

    const gesture = Gesture.Pan()
      .enabled(enabled)
      .onUpdate((e) => {
        'worklet';
        translateY.value = -activeIdxSV.value * itemHeightSV.value + e.translationY;
      })
      .onEnd((e) => {
        'worklet';
        const curr = activeIdxSV.value;
        const h    = itemHeightSV.value;

        const goForward  = e.translationY < -h * DIST_RATIO || e.velocityY < -VEL_THRESHOLD;
        const goBackward = e.translationY >  h * DIST_RATIO || e.velocityY >  VEL_THRESHOLD;

        let next = curr;
        if (goForward)  next = Math.min(curr + 1, itemCountSV.value - 1);
        if (goBackward) next = Math.max(curr - 1, 0);

        // User tried to go past the last item — notify parent (e.g., profile hint)
        if (goForward && next === curr && onOverscrollDown) {
          runOnJS(onOverscrollDown)();
        }

        activeIdxSV.value = next;
        translateY.value  = withSpring(-next * h, SPRING_CONFIG);

        if (next !== curr) runOnJS(onIndexChange)(next);
      });

    const animStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    return (
      <GestureDetector gesture={gesture}>
        <View style={styles.container}>
          <Animated.View style={[{ height: itemHeight * itemCount }, animStyle]}>
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
});
