import '@/i18n'; // inicializa i18next con los recursos bundleados
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform, useColorScheme, View, type AppStateStatus, type ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { GDPRConsentModal } from '@/components/ui/GDPRConsentModal';
import { OnboardingModal } from '@/components/ui/OnboardingModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { analytics } from '@/services/analytics';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { drainSyncQueue } from '@/services/offlineSyncQueue';
import { initAds } from '@/services/ads';
import { configurePurchases, syncPremiumStatus } from '@/services/purchases';
import { registerPendingReferral, syncReferralPremium } from '@/services/referral';
import { useReferral } from '@/hooks/useReferral';
import {
  registerPushToken,
  scheduleStreakReminder,
  scheduleReviewReminder,
  cancelTodayNotifications,
} from '@/services/notifications';
import { loadDueProgress } from '@/services/puzzleProgress';
import i18n, { getDeviceLocale } from '@/i18n';

/** S11.4 — Scheduling inteligente: cancela notifs si el usuario ya jugó hoy,
 *  o las (re)programa con el conteo actual de repasos FSRS. */
async function refreshNotifications(userId: string | undefined): Promise<void> {
  const { lastActiveDate, streakDays, notificationStreakHour } = useUserStore.getState();
  const today = new Date().toISOString().split('T')[0];
  if (lastActiveDate === today) {
    await cancelTodayNotifications();
    return;
  }
  await scheduleStreakReminder(notificationStreakHour, streakDays);
  try {
    const due = await loadDueProgress(userId ?? '', new Date());
    await scheduleReviewReminder(due.length);
  } catch {
    // Si no hay conectividad, skip — la racha ya está programada
  }
}

function AuthGuard() {
  const { user, isGuest, isLoading, initAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const unsubscribe = initAuth();
    initAds().catch(console.error);
    refreshNotifications(undefined).catch(console.error);
    analytics.track('app_opened');
    return unsubscribe;
  }, []);

  useEffect(() => {
    configurePurchases(user?.id);
    if (user?.id) {
      syncPremiumStatus().catch(console.error);
      registerPendingReferral(user.id).catch(console.error);
      syncReferralPremium(user.id).catch(console.error);
      registerPushToken(user.id).catch(console.error);
      analytics.identify(user.id);
    } else {
      analytics.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useReferral();

  // S12.4 — sincronizar idioma cuando la preferencia del usuario se hidrata desde AsyncStorage
  const preferredLanguage = useUserStore((s) => s.preferredLanguage);
  useEffect(() => {
    i18n.changeLanguage(preferredLanguage ?? getDeviceLocale());
  }, [preferredLanguage]);

  // Drain the offline FSRS sync queue whenever the app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (next === 'active' && prev !== 'active') {
        if (user?.id) drainSyncQueue(user.id).catch(console.error);
        // S11.4: scheduling inteligente en cada vuelta a foreground
        refreshNotifications(user?.id).catch(console.error);
      }
    });
    return () => sub.remove();
  }, [user?.id]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const isAuthenticated = user !== null || isGuest;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/auth/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isGuest, isLoading, segments]);

  return null;
}

function ThemedApp() {
  const { scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
      <GDPRConsentModal />
      <OnboardingModal />
    </>
  );
}

export default function RootLayout() {
  const scheme   = useColorScheme();
  const isWeb    = Platform.OS === 'web';
  const gutterBg = scheme === 'dark' ? '#0a0a0a' : '#d8d8d0';

  return (
    <View style={isWeb ? { flex: 1, backgroundColor: gutterBg, alignItems: 'center' } : { flex: 1 }}>
      <GestureHandlerRootView
        style={[
          { flex: 1 },
          isWeb && ({ width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 0 80px rgba(0,0,0,0.45)' } as ViewStyle),
        ]}
      >
        <ErrorBoundary>
          <ThemedApp />
        </ErrorBoundary>
      </GestureHandlerRootView>
    </View>
  );
}
