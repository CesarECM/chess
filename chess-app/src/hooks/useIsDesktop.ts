import { Platform, useWindowDimensions } from 'react-native';

/** True when running in a browser viewport ≥ 640 px wide (desktop / tablet landscape). */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 640;
}
