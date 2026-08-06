import { View } from 'react-native';

export interface SessionProgressArcProps {
  count:        number;
  isGateOpen:   boolean;
  isResumen:    boolean;
  successColor: string;
  trackColor:   string;
}

// Web fallback — simple dot that matches the gate/resumen state visually
export function SessionProgressArc({ isGateOpen, isResumen, successColor, trackColor }: SessionProgressArcProps) {
  const color = isResumen || isGateOpen ? successColor : trackColor;
  return <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: color }} />;
}
