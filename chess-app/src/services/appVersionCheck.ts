import { Platform } from 'react-native';
import { supabase } from './supabase';

export type VersionCheckResult =
  | { blocked: false }
  | { blocked: true; message: string; storeUrl: string };

/** Semantic version comparison: returns negative if a < b, 0 if equal, positive if a > b. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const STORE_URLS: Record<string, string> = {
  ios: 'https://apps.apple.com/app/id6738318851',
  android: 'https://play.google.com/store/apps/details?id=mx.ceecm.chessapp',
};

/**
 * Checks whether the running native binary meets the minimum supported version
 * stored in Supabase. On web this is a no-op (returns { blocked: false }).
 *
 * Must be called before rendering the feed so an outdated binary is hard-blocked.
 */
export async function checkNativeVersion(): Promise<VersionCheckResult> {
  if (Platform.OS === 'web') return { blocked: false };

  let currentVersion: string | null = null;
  try {
    // expo-application only available on native — dynamic import avoids web bundling issues
    const { nativeApplicationVersion } = await import('expo-application');
    currentVersion = nativeApplicationVersion;
  } catch {
    return { blocked: false };
  }

  if (!currentVersion) return { blocked: false };

  const { data, error } = await supabase
    .from('app_version_control')
    .select('min_supported_version, force_update, update_message')
    .eq('platform', Platform.OS)
    .single();

  if (error || !data) return { blocked: false };

  const isBelowMin = compareVersions(currentVersion, data.min_supported_version) < 0;

  if (!isBelowMin && !data.force_update) return { blocked: false };

  return {
    blocked: true,
    message: data.update_message ?? 'Hay una nueva versión disponible. Actualiza para seguir jugando.',
    storeUrl: STORE_URLS[Platform.OS] ?? '',
  };
}

/**
 * Silently checks for a JS OTA update via EAS Update and reloads if one is available.
 * Failures are swallowed — never block the user due to a failed OTA check.
 * No-op on web.
 */
export async function checkOTAUpdate(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const Updates = await import('expo-updates');
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Fail silently — OTA check must never block usage
  }
}
