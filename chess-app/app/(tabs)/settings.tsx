import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { signOut } from '@/services/auth';
import type { ThemePreference } from '@/stores/useThemeStore';

const OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: 'Sistema', value: 'system' },
  { label: 'Claro',   value: 'light'  },
  { label: 'Oscuro',  value: 'dark'   },
];

export default function SettingsScreen() {
  const { colors, typography, radius } = useTheme();
  const { preference, setPreference } = useThemeStore();
  const { user, isGuest, reset } = useAuthStore();
  const isPremium = useUserStore((s) => s.isPremium);
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // onAuthStateChange still fires even if signOut throws (e.g. already signed out)
      reset();
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.inner}>
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

      {/* ── Suscripción ──────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        SUSCRIPCIÓN
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        <TouchableOpacity style={styles.row} onPress={() => router.push('/subscription' as never)}>
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {isPremium ? '✓ Premium activo' : 'Hacerse Premium — $2.99/mes'}
          </Text>
          {!isPremium && (
            <Text style={[{ color: colors.textSecondary, fontSize: typography.size.md }]}>›</Text>
          )}
        </TouchableOpacity>
      </View>

      {!isGuest && user && (
        <>
          <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
            CUENTA
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
            <View style={styles.row}>
              <Text style={{ color: colors.textSecondary, fontSize: typography.size.sm }} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              onPress={handleSignOut}
            >
              <Text style={[styles.label, { color: colors.error, fontSize: typography.size.md }]}>
                Cerrar sesión
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner:     { padding: 16, paddingTop: 60, paddingBottom: 32 },
  section:   { marginBottom: 8, marginLeft: 4, letterSpacing: 0.5, fontWeight: '600' },
  card:      { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  label:     {},
  dot:       { width: 8, height: 8, borderRadius: 4 },
});
