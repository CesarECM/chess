import { useUserStore } from '@/stores/useUserStore';

const POSTHOG_HOST = 'https://us.i.posthog.com';
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';

let currentDistinctId = 'anonymous';

function isEnabled(): boolean {
  if (!API_KEY) return false;
  return useUserStore.getState().analyticsConsent;
}

function capture(event: string, properties: Record<string, unknown> = {}): void {
  if (!isEnabled()) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: API_KEY,
      event,
      distinct_id: currentDistinctId,
      properties,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {});
}

export const analytics = {
  identify(userId: string, properties?: Record<string, unknown>): void {
    if (!isEnabled()) return;
    currentDistinctId = userId;
    capture('$identify', { $set: properties ?? {} });
  },

  track(event: string, properties?: Record<string, unknown>): void {
    capture(event, properties ?? {});
  },

  screen(name: string, properties?: Record<string, unknown>): void {
    capture('$screen', { $screen_name: name, ...(properties ?? {}) });
  },

  reset(): void {
    currentDistinctId = 'anonymous';
  },
};
