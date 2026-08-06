import { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { SessionProgressArcProps } from './SessionProgressArc';

const SIZE   = 24;
const STROKE = 2.5;
const RECT   = {
  x:      STROKE / 2,
  y:      STROKE / 2,
  width:  SIZE - STROKE,
  height: SIZE - STROKE,
};

export function SessionProgressArc({
  count,
  isGateOpen,
  isResumen,
  successColor,
  trackColor,
}: SessionProgressArcProps) {
  const trackPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.addArc(RECT, 0, 360);
    return p;
  }, []);

  const fillPath = useMemo(() => {
    const p = Skia.Path.Make();
    const sweep = isResumen || isGateOpen ? 360 : (count / 10) * 360;
    if (sweep > 0) p.addArc(RECT, -90, sweep);
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, isGateOpen, isResumen]);

  const hasFill    = isResumen || isGateOpen || count > 0;
  const fillColor  = isResumen || isGateOpen ? successColor : successColor + 'BB';

  return (
    <Canvas style={{ width: SIZE, height: SIZE }}>
      <Path path={trackPath} color={trackColor} style="stroke" strokeWidth={STROKE} strokeCap="round" />
      {hasFill && (
        <Path path={fillPath} color={fillColor} style="stroke" strokeWidth={STROKE} strokeCap="round" />
      )}
    </Canvas>
  );
}
