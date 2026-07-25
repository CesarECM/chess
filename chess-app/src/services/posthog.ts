import { useUserStore } from '@/stores/useUserStore';

const POSTHOG_HOST = 'https://us.i.posthog.com';
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';

/** Cache en memoria para evitar llamadas repetidas al decide endpoint */
const flagCache: Record<string, unknown> = {};
let cacheDistinctId: string | null = null;

/**
 * Obtiene el valor de un feature flag desde PostHog /decide/ endpoint.
 * Retorna undefined si analytics no está habilitado o hay error de red.
 */
export async function getFeatureFlag(flagKey: string, distinctId: string): Promise<unknown> {
  if (!API_KEY || !useUserStore.getState().analyticsConsent) return undefined;

  // Invalidar caché si cambió el usuario
  if (cacheDistinctId !== distinctId) {
    for (const key of Object.keys(flagCache)) delete flagCache[key];
    cacheDistinctId = distinctId;
  }

  if (flagKey in flagCache) return flagCache[flagKey];

  try {
    const res = await fetch(`${POSTHOG_HOST}/decide/?v=3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: API_KEY, distinct_id: distinctId }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { featureFlags?: Record<string, unknown> };
    const flags = data.featureFlags ?? {};
    for (const [k, v] of Object.entries(flags)) flagCache[k] = v;
    return flagCache[flagKey];
  } catch {
    return undefined;
  }
}
