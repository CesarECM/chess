import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { drainSyncQueue } from '@/services/offlineSyncQueue';
import { initAds } from '@/services/ads';
import { configurePurchases, syncPremiumStatus } from '@/services/purchases';
import { registerPendingReferral, syncReferralPremium } from '@/services/referral';
import { useReferral } from '@/hooks/useReferral';

function AuthGuard() {
  const { user, isGuest, isLoading, initAuth } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const unsubscribe = initAuth();
    initAds().catch(console.error);
    return unsubscribe;
  }, []);

  useEffect(() => {
    configurePurchases(user?.id);
    if (user?.id) {
      syncPremiumStatus().catch(console.error);
      registerPendingReferral(user.id).catch(console.error);
      syncReferralPremium(user.id).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useReferral();

  // Drain the offline FSRS sync queue whenever the app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (next === 'active' && prev !== 'active' && user?.id) {
        drainSyncQueue(user.id).catch(console.error);
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
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemedApp />
    </GestureHandlerRootView>
  );
}
