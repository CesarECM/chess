import { useColorScheme } from 'react-native';

import { palette, radius, spacing, typography } from '@/constants/theme';
import type { ColorScheme } from '@/constants/theme';
import { useThemeStore } from '@/stores/useThemeStore';

export function useTheme() {
  const { preference } = useThemeStore();
  const raw = useColorScheme();
  const systemScheme: ColorScheme = raw === 'dark' ? 'dark' : 'light';

  const scheme: ColorScheme =
    preference === 'system' ? systemScheme : preference;

  return {
    scheme,
    colors: palette[scheme],
    typography,
    spacing,
    radius,
  };
}
