import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '@/services/supabase';
import { analytics } from '@/services/analytics';
import i18n from '@/i18n';

export const STREAK_NOTIF_ID  = 'chess-streak-daily';
export const REVIEW_NOTIF_ID  = 'chess-review-daily';
export const SIEGE_NOTIF_ID   = 'chess-siege-48h';
export const WINBACK_NOTIF_ID = 'chess-winback-7d';

// Handler controls how notifications behave when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** S11.1 — Obtiene el Expo Push Token y lo guarda en Supabase para el usuario autenticado. */
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const granted = await requestPermissions();
    if (!granted) return;
    const projectId =
      (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch (e) {
    console.error('[notifications] registerPushToken:', e);
  }
}

/** S11.2 — Programa una notificación diaria de racha a la hora configurada.
 *  Cancela la anterior antes de programar la nueva. */
export async function scheduleStreakReminder(
  hour: number,
  streakDays: number,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_NOTIF_ID).catch(() => null);
  const granted = await requestPermissions();
  if (!granted) return;
  const body = streakDays > 0
    ? i18n.t('notification.streakBody', { count: streakDays })
    : i18n.t('notification.streakBodyZero');
  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_NOTIF_ID,
    content: { title: i18n.t('notification.title'), body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
  if (streakDays > 0) {
    analytics.track('notification_streak_risk_sent', { streak_days: streakDays });
  }
}

/** S11.3 — Programa una notificación one-shot 2 horas desde ahora cuando hay repasos FSRS pendientes.
 *  No hace nada si ya es tarde (después de las 23 h) o si dueCount === 0. */
export async function scheduleReviewReminder(dueCount: number): Promise<void> {
  if (Platform.OS === 'web' || dueCount === 0) return;
  await Notifications.cancelScheduledNotificationAsync(REVIEW_NOTIF_ID).catch(() => null);
  const granted = await requestPermissions();
  if (!granted) return;
  const fireInSeconds = 2 * 60 * 60; // 2 horas
  const fireAt = new Date(Date.now() + fireInSeconds * 1000);
  if (fireAt.getHours() >= 23) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REVIEW_NOTIF_ID,
    content: {
      title: i18n.t('notification.reviewTitle'),
      body: i18n.t('notification.reviewBody', { count: dueCount }),
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: fireInSeconds,
      repeats: false,
    },
  });
}

/** S11.4 — Cancela las notificaciones del día cuando el usuario ya estuvo activo. */
export async function cancelTodayNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(STREAK_NOTIF_ID).catch(() => null),
    Notifications.cancelScheduledNotificationAsync(REVIEW_NOTIF_ID).catch(() => null),
  ]);
}

/** MPS #45 — Asedio: one-shot en +48h al ir a background. */
export async function scheduleSiegeNotification(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(SIEGE_NOTIF_ID).catch(() => null);
  const granted = await requestPermissions();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: SIEGE_NOTIF_ID,
    content: {
      title: i18n.t('notification.title'),
      body:  i18n.t('notification.siegeBody'),
      sound: true,
    },
    trigger: {
      type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 48 * 60 * 60,
      repeats: false,
    },
  });
  analytics.track('notification_siege_sent', {});
}

/** MPS #45 — Win-back: one-shot en +7 días al ir a background. */
export async function scheduleWinbackNotification(streakDays: number): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(WINBACK_NOTIF_ID).catch(() => null);
  const granted = await requestPermissions();
  if (!granted) return;
  const body = streakDays > 0
    ? i18n.t('notification.winbackBodyStreak', { count: streakDays })
    : i18n.t('notification.winbackBody');
  await Notifications.scheduleNotificationAsync({
    identifier: WINBACK_NOTIF_ID,
    content: { title: i18n.t('notification.title'), body, sound: true },
    trigger: {
      type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 7 * 24 * 60 * 60,
      repeats: false,
    },
  });
  analytics.track('notification_winback_sent', { days_inactive_threshold: 7, streak_days: streakDays });
}

/** MPS #45 — Programa asedio + win-back al ir a background o cerrar sesión. */
export async function scheduleBackgroundNotifications(streakDays: number): Promise<void> {
  await Promise.all([
    scheduleSiegeNotification(),
    scheduleWinbackNotification(streakDays),
  ]);
}

/** MPS #45 — Cancela asedio + win-back cuando el usuario vuelve a la app. */
export async function cancelReentryNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(SIEGE_NOTIF_ID).catch(() => null),
    Notifications.cancelScheduledNotificationAsync(WINBACK_NOTIF_ID).catch(() => null),
  ]);
}
