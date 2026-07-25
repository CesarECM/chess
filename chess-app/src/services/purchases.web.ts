import type { PurchasesPackage } from 'react-native-purchases';

export function configurePurchases(_userId?: string): void {}

export async function getMonthlyPackage(): Promise<PurchasesPackage | null> {
  return null;
}

export async function purchasePackage(_pkg: PurchasesPackage): Promise<boolean> {
  return false;
}

export async function restorePurchases(): Promise<boolean> {
  return false;
}

export async function syncPremiumStatus(): Promise<void> {}
