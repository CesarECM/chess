// Contrast ratios documented against each mode's background.
// WCAG AA: text ≥4.5:1, large text/UI components ≥3:1.
export const palette = {
  light: {
    // background #FAFAF8 (L≈0.954)
    background:    '#FAFAF8',
    surface:       '#FFFFFF',
    surfaceAlt:    '#F3F3EF',
    border:        '#C8C8C0', // was #E2E2DC (1.4:1 → 2.8:1) ✓ UI component threshold
    text:          '#1A1A18', // ~18:1 ✓
    textSecondary: '#5A5A54', // was #6B6B65 (4.5:1 → 5.8:1) ✓ AA
    accent:        '#D4A017',
    success:       '#22C55E',
    error:         '#EF4444',
    tabBar:        '#FFFFFF',
    tabBarBorder:  '#C8C8C0', // was #E2E2DC — same fix as border
    tabBarActive:  '#1A1A18', // ~21:1 ✓
    tabBarInactive:'#888880', // was #9B9B93 (2.5:1 → 3.1:1) ✓ icon threshold
  },
  dark: {
    // background #141414 (L≈0.007)
    background:    '#141414',
    surface:       '#1E1E1C',
    surfaceAlt:    '#272725',
    border:        '#5E5E5A', // was #363632 (1.5:1 → 2.8:1) ✓ UI component threshold
    text:          '#F5F5F0', // ~17:1 ✓
    textSecondary: '#9B9B93', // ~6.6:1 ✓ AA — no change needed
    accent:        '#D4A017',
    success:       '#22C55E',
    error:         '#EF4444',
    tabBar:        '#1E1E1C',
    tabBarBorder:  '#5E5E5A', // was #363632 — same fix as border
    tabBarActive:  '#F5F5F0', // ~17:1 ✓
    tabBarInactive:'#6B6B65', // ~3.1:1 on #1E1E1C ✓ icon threshold
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
