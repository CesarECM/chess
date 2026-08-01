import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { EvalPoint } from '@/services/analysis/useBatchEval';

const BAR_HEIGHT = 28;
const CP_MAX     = 500; // ±5 pawns = full bar

interface Props {
  evals:       Array<EvalPoint | null>;
  activeIndex: number;
  onBarPress:  (index: number) => void;
}

function cpToRatio(cp: number | null, mate: number | null): number {
  if (mate !== null) return mate > 0 ? 1 : -1;
  if (cp  === null)  return 0;
  return Math.max(-1, Math.min(1, cp / CP_MAX));
}

export function EvalHistoryBar({ evals, activeIndex, onBarPress }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {evals.map((pt, i) => {
        const ratio   = pt ? cpToRatio(pt.cp, pt.mate) : 0;
        const isActive = i === activeIndex;
        const hasData  = pt !== null;

        // ratio > 0 = white advantage (bar extends upward from center)
        // ratio < 0 = black advantage (bar extends downward from center)
        const upH   = ratio > 0 ? (ratio  * BAR_HEIGHT) / 2 : 0;
        const downH = ratio < 0 ? (-ratio * BAR_HEIGHT) / 2 : 0;

        return (
          <TouchableOpacity
            key={i}
            style={[styles.barWrapper, isActive && { opacity: 1 }, !isActive && { opacity: 0.55 }]}
            onPress={() => onBarPress(i)}
            activeOpacity={0.7}
            hitSlop={4}
          >
            {/* top half (white advantage) */}
            <View style={[styles.half, { height: BAR_HEIGHT / 2, justifyContent: 'flex-end' }]}>
              {hasData && upH > 0 && (
                <View style={[
                  styles.fill,
                  { height: upH, backgroundColor: isActive ? colors.accent : colors.success },
                ]} />
              )}
            </View>

            {/* center axis line */}
            <View style={[styles.axis, { backgroundColor: colors.border }]} />

            {/* bottom half (black advantage) */}
            <View style={[styles.half, { height: BAR_HEIGHT / 2, justifyContent: 'flex-start' }]}>
              {hasData && downH > 0 && (
                <View style={[
                  styles.fill,
                  { height: downH, backgroundColor: isActive ? colors.accent : colors.textSecondary },
                ]} />
              )}
            </View>

            {/* placeholder when no data */}
            {!hasData && (
              <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: colors.border }]} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flexDirection: 'row', alignItems: 'center', gap: 2, height: BAR_HEIGHT, alignSelf: 'stretch' },
  barWrapper:  { flex: 1, height: BAR_HEIGHT, justifyContent: 'center' },
  half:        { overflow: 'hidden', alignSelf: 'stretch' },
  fill:        { alignSelf: 'stretch', borderRadius: 1 },
  axis:        { height: 1, alignSelf: 'stretch' },
  placeholder: { borderRadius: 2, opacity: 0.15 },
});
