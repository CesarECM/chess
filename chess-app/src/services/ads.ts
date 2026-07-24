import { Platform } from 'react-native';
import mobileAds, { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { useUserStore, selectIsPremiumActive } from '@/stores/useUserStore';

const INTERSTITIAL_ID = (
  Platform.OS === 'ios'
    ? (process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS ?? TestIds.INTERSTITIAL)
    : (process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID ?? TestIds.INTERSTITIAL)
);

const AD_INTERVAL = 5;

let puzzleCounter = 0;
let ad: InterstitialAd | null = null;
let adLoaded = false;

function loadNext() {
  ad = InterstitialAd.createForAdRequest(INTERSTITIAL_ID);
  const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
    adLoaded = true;
    unsubLoaded();
  });
  const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
    adLoaded = false;
    unsubClosed();
    loadNext();
  });
  ad.load();
}

export async function initAds(): Promise<void> {
  if (Platform.OS === 'web') return;
  await mobileAds().initialize();
  loadNext();
}

/** Call after each puzzle advance. Shows interstitial every AD_INTERVAL puzzles for non-premium users. */
export function showInterstitialIfDue(): void {
  if (Platform.OS === 'web') return;
  if (selectIsPremiumActive(useUserStore.getState())) return;
  puzzleCounter++;
  if (puzzleCounter < AD_INTERVAL || !adLoaded || !ad) return;
  puzzleCounter = 0;
  try {
    ad.show();
  } catch {
    // Ad not ready — skip silently and reload
    adLoaded = false;
    loadNext();
  }
}
