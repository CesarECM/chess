import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/stores/useThemeStore';
import type { ThemePreference } from '@/stores/useThemeStore';

const OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Sistema', value: 'system' },
  { label: 'Claro',   value: 'light'  },
  { label: 'Oscuro',  value: 'dark'   },
];

export default function SettingsScreen() {
  const { colors, typography, spacing, radius } = useTheme();
  const { preference, setPreference } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        APARIENCIA
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        {OPTIONS.map(({ label, value }, i) => (
          <TouchableOpacity
            key={value}
            onPress={() => setPreference(value)}
            style={[
              styles.row,
              i < OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
              {label}
            </Text>
            {preference === value && (
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 60 },
  section:   { marginBottom: 8, marginLeft: 4, letterSpacing: 0.5, fontWeight: '600' },
  card:      { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  label:     {},
  dot:       { width: 8, height: 8, borderRadius: 4 },
});
