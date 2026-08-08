import type { AccessibilityRole } from 'react-native';

export function btn(label: string, hint?: string) {
  return {
    accessible: true,
    accessibilityRole: 'button' as AccessibilityRole,
    accessibilityLabel: label,
    ...(hint ? { accessibilityHint: hint } : {}),
  };
}

export function img(label: string) {
  return {
    accessible: true,
    accessibilityRole: 'image' as AccessibilityRole,
    accessibilityLabel: label,
  };
}

export function liveText(label: string, live: 'polite' | 'assertive' = 'polite') {
  return {
    accessible: true,
    accessibilityRole: 'text' as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityLiveRegion: live,
  };
}

export function alert(label: string) {
  return {
    accessible: true,
    accessibilityRole: 'alert' as AccessibilityRole,
    accessibilityLabel: label,
    accessibilityLiveRegion: 'polite' as const,
  };
}

export function decorative() {
  return {
    accessible: false,
    importantForAccessibility: 'no-hide-descendants' as const,
  };
}
