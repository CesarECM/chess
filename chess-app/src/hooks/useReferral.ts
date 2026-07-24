import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/stores/useAuthStore';
import { savePendingRef, registerPendingReferral } from '@/services/referral';

/**
 * Listens for deep links matching chess-app://join?ref=XXXXXXXX.
 * Saves the code to AsyncStorage and, if the user is already authenticated,
 * registers the referral immediately via Supabase RPC.
 */
export function useReferral() {
  const { user } = useAuthStore();

  useEffect(() => {
    async function handleUrl(url: string) {
      const parsed = Linking.parse(url);
      const refCode = parsed.queryParams?.ref;
      if (!refCode || typeof refCode !== 'string') return;

      await savePendingRef(refCode);
      if (user?.id) {
        registerPendingReferral(user.id).catch(console.error);
      }
    }

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });

    const sub = Linking.addEventListener('url', ({ url }) => { handleUrl(url); });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}
