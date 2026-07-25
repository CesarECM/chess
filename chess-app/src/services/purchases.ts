import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type { PurchasesPackage } from 'react-native-purchases';
import { useUserStore } from '@/stores/useUserStore';
import { analytics } from '@/services/analytics';

const ENTITLEMENT_ID = 'premium';

export function configurePurchases(userId?: string): void {
  if (Platform.OS === 'web') return;

  const apiKey = Platform.OS === 'ios'
    ? (process.env.EXPO_PUBLIC_REVENUECAT_KEY_IOS ?? '')
    : (process.env.EXPO_PUBLIC_REVENUECAT_KEY_ANDROID ?? '');

  if (!apiKey) return;

  Purchases.setLogLevel(LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey, appUserID: userId });
}

/** Returns the monthly package from RevenueCat offerings, or null if unavailable. */
export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  if (Platform.OS === 'web') return null;
  try {
    const offerings = await Purchases.getOfferings();
    return (
      offerings.current?.monthly ??
      offerings.current?.availablePackages[0] ??
      null
    );
  } catch {
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = ENTITLEMENT_ID in customerInfo.entitlements.active;
    if (isPremium) {
      useUserStore.getState().setPremium(true);
      analytics.track('subscription_started', { platform: Platform.OS });
    }
    return isPremium;
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'userCancelled' in e && !e.userCancelled) {
      console.error('[purchases] error:', e);
    }
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPremium = ENTITLEMENT_ID in customerInfo.entitlements.active;
    useUserStore.getState().setPremium(isPremium);
    return isPremium;
  } catch {
    return false;
  }
}

/** Sync premium status from RevenueCat on app launch. */
export async function syncPremiumStatus(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isPremium = ENTITLEMENT_ID in customerInfo.entitlements.active;
    useUserStore.getState().setPremium(isPremium);
  } catch {
    // Network issue — keep persisted state
  }
}
