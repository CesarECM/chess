import { Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { signOut } from '@/services/auth';
import { scheduleStreakReminder } from '@/services/notifications';
import i18n, { getDeviceLocale } from '@/i18n';
import type { ThemePreference } from '@/stores/useThemeStore';
import { BOARD_THEMES, PIECE_SETS } from '@/constants/boardThemes';
import { getPieceUrl } from '@/constants/pieceSets';
import type { BoardThemeId, PieceSetId } from '@/constants/boardThemes';

const NOTIFICATION_HOURS: { label: string; value: number }[] = [
  { label: '8:00',  value: 8  },
  { label: '12:00', value: 12 },
  { label: '18:00', value: 18 },
  { label: '20:00', value: 20 },
  { label: '22:00', value: 22 },
];

const LANGUAGE_OPTIONS: { key: string; value: string | null }[] = [
  { key: 'settings.langAuto', value: null  },
  { key: 'settings.langEs',   value: 'es'  },
  { key: 'settings.langEn',   value: 'en'  },
  { key: 'settings.langPt',   value: 'pt'  },
  { key: 'settings.langFr',   value: 'fr'  },
];

export default function SettingsScreen() {
  const { colors, typography, radius } = useTheme();
  const { t } = useTranslation();
  const { preference, setPreference } = useThemeStore();
  const { user, isGuest, reset } = useAuthStore();
  const isPremium = useUserStore((s) => s.isPremium);
  const streakDays = useUserStore((s) => s.streakDays);
  const notificationStreakHour = useUserStore((s) => s.notificationStreakHour);
  const setNotificationStreakHour = useUserStore((s) => s.setNotificationStreakHour);
  const preferredLanguage = useUserStore((s) => s.preferredLanguage);
  const setPreferredLanguage = useUserStore((s) => s.setPreferredLanguage);
  const boardTheme = useUserStore((s) => s.boardTheme);
  const setBoardTheme = useUserStore((s) => s.setBoardTheme);
  const pieceSet = useUserStore((s) => s.pieceSet);
  const setPieceSet = useUserStore((s) => s.setPieceSet);
  const soundEnabled = useUserStore((s) => s.soundEnabled);
  const setSoundEnabled = useUserStore((s) => s.setSoundEnabled);
  const router = useRouter();

  const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
    { label: t('settings.themeSystem'), value: 'system' },
    { label: t('settings.themeLight'),  value: 'light'  },
    { label: t('settings.themeDark'),   value: 'dark'   },
  ];

  async function handleSelectNotificationHour(hour: number) {
    setNotificationStreakHour(hour);
    await scheduleStreakReminder(hour, streakDays).catch(console.error);
  }

  function handleSelectLanguage(value: string | null) {
    setPreferredLanguage(value);
    i18n.changeLanguage(value ?? getDeviceLocale());
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      reset();
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.inner}>
      {/* ── Apariencia ───────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs }]}>
        {t('settings.sectionAppearance')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        {THEME_OPTIONS.map(({ label, value }, i) => (
          <TouchableOpacity
            key={value}
            onPress={() => setPreference(value)}
            style={[
              styles.row,
              i < THEME_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
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

      {/* ── Idioma ───────────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        {t('settings.sectionLanguage')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        {LANGUAGE_OPTIONS.map(({ key, value }, i) => (
          <TouchableOpacity
            key={key}
            onPress={() => handleSelectLanguage(value)}
            style={[
              styles.row,
              i < LANGUAGE_OPTIONS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
              {t(key)}
            </Text>
            {preferredLanguage === value && (
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Notificaciones ───────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        {t('settings.sectionNotifications')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.sm }]}>
            {t('settings.notificationStreak')}
          </Text>
        </View>
        {NOTIFICATION_HOURS.map(({ label, value }, i) => (
          <TouchableOpacity
            key={value}
            onPress={() => handleSelectNotificationHour(value)}
            style={[
              styles.row,
              i < NOTIFICATION_HOURS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
              {label}
            </Text>
            {notificationStreakHour === value && (
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Suscripción ──────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        {t('settings.sectionSubscription')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        <TouchableOpacity style={styles.row} onPress={() => router.push('/subscription' as never)}>
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {isPremium ? t('settings.subscriptionActive') : t('settings.subscriptionUpgrade')}
          </Text>
          {!isPremium && (
            <Text style={[{ color: colors.textSecondary, fontSize: typography.size.md }]}>›</Text>
          )}
        </TouchableOpacity>
      </View>

      {!isGuest && user && (
        <>
          <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
            {t('settings.sectionAccount')}
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
                {t('settings.signOut')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Tablero ──────────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        {t('settings.sectionBoard')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        {/* Sound toggle */}
        <TouchableOpacity
          style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          onPress={() => setSoundEnabled(!soundEnabled)}
        >
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {t('settings.soundEnabled')}
          </Text>
          {soundEnabled && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
        </TouchableOpacity>

        {/* Board color theme */}
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.sm }]}>
            {t('settings.boardThemeLabel')}
          </Text>
        </View>
        <View style={[styles.themeRow]}>
          {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => {
            const th = BOARD_THEMES[id];
            const isActive = boardTheme === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setBoardTheme(id)}
                style={[styles.themeChip, isActive && { borderColor: colors.accent, borderWidth: 2 }]}
              >
                <View style={styles.themePreview}>
                  <View style={[styles.themeHalf, { backgroundColor: th.light }]} />
                  <View style={[styles.themeHalf, { backgroundColor: th.dark }]} />
                </View>
                <Text style={[styles.themeLabel, { color: isActive ? colors.accent : colors.textSecondary, fontSize: typography.size.xs }]}>
                  {t(`settings.boardTheme${id.charAt(0).toUpperCase() + id.slice(1)}` as never)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Piece set — web only */}
        {Platform.OS === 'web' && (
          <>
            <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text, fontSize: typography.size.sm }]}>
                {t('settings.pieceSetLabel')}
              </Text>
            </View>
            <View style={styles.pieceSetRow}>
              {PIECE_SETS.map((id) => {
                const active = pieceSet === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setPieceSet(id as PieceSetId)}
                    style={[
                      styles.pieceChip,
                      {
                        borderColor: active ? colors.accent : colors.border,
                        borderRadius: radius.md,
                        backgroundColor: active ? colors.accent + '18' : 'transparent',
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: getPieceUrl(id, 'wQ') }}
                      style={styles.queenImg}
                    />
                    <Text style={[styles.pieceLabel, { color: active ? colors.accent : colors.textSecondary, fontSize: typography.size.xs }]}>
                      {t(`settings.pieceSet${id.charAt(0).toUpperCase() + id.slice(1)}` as never)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>

      {/* ── Soporte ──────────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        {t('settings.sectionSupport')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        <TouchableOpacity
          style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          onPress={() => router.push('/faq' as never)}
        >
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {t('settings.faq')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.md }}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL('mailto:support@ceecm.mx?subject=Chess%20Puzzle%20App')}
        >
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {t('settings.contactSupport')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.md }}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── Legal ────────────────────────────────────────────── */}
      <Text style={[styles.section, { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 24 }]}>
        {t('settings.sectionLegal')}
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
        <TouchableOpacity
          style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
          onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? 'https://www.iubenda.com/privacy-policy')}
        >
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {t('settings.privacyPolicy')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.md }}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_TOS_URL ?? 'https://www.iubenda.com/terms-and-conditions')}
        >
          <Text style={[styles.label, { color: colors.text, fontSize: typography.size.md }]}>
            {t('settings.termsOfService')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.size.md }}>›</Text>
        </TouchableOpacity>
      </View>
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
  themeRow:  { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 8 },
  themeChip: { alignItems: 'center', gap: 6, padding: 6, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  themePreview: { flexDirection: 'row', width: 44, height: 44, borderRadius: 6, overflow: 'hidden' },
  themeHalf: { flex: 1 },
  themeLabel: { fontWeight: '600' },
  pieceSetRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 8 },
  pieceChip:   { alignItems: 'center', gap: 6, padding: 10, borderWidth: 1.5 },
  queenImg:    { width: 44, height: 44 },
  pieceLabel:  { fontWeight: '600' },
});
