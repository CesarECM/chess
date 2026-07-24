export const palette = {
  light: {
    background:    '#FAFAF8',
    surface:       '#FFFFFF',
    surfaceAlt:    '#F3F3EF',
    border:        '#E2E2DC',
    text:          '#1A1A18',
    textSecondary: '#6B6B65',
    accent:        '#D4A017',
    success:       '#22C55E',
    error:         '#EF4444',
    tabBar:        '#FFFFFF',
    tabBarBorder:  '#E2E2DC',
    tabBarActive:  '#1A1A18',
    tabBarInactive:'#9B9B93',
  },
  dark: {
    background:    '#141414',
    surface:       '#1E1E1C',
    surfaceAlt:    '#272725',
    border:        '#363632',
    text:          '#F5F5F0',
    textSecondary: '#9B9B93',
    accent:        '#D4A017',
    success:       '#22C55E',
    error:         '#EF4444',
    tabBar:        '#1E1E1C',
    tabBarBorder:  '#363632',
    tabBarActive:  '#F5F5F0',
    tabBarInactive:'#6B6B65',
  },
} as const;

export const typography = {
  size: {
    xs:  11,
    sm:  13,
    md:  15,
    lg:  17,
    xl:  20,
    '2xl': 24,
    '3xl': 30,
  },
  weight: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
} as const;

export const spacing = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  full: 9999,
} as const;

export type ColorScheme = 'light' | 'dark';
export type ThemeColors = typeof palette.light;
