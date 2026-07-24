import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share } from 'react-native';
import { supabase } from '@/services/supabase';
import { useUserStore } from '@/stores/useUserStore';

const PENDING_REF_KEY = 'chess_pending_ref';
export const REFERRAL_REWARD_DAYS = 7;
export const REFERRAL_PUZZLES_REQUIRED = 5;

// ── Code helpers ───────────────────────────────────────────────────────────────

export function getReferralCode(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toLowerCase();
}

export function getReferralLink(userId: string): string {
  return `chess-app://join?ref=${getReferralCode(userId)}`;
}

// ── Pending ref (AsyncStorage) ─────────────────────────────────────────────────

export async function savePendingRef(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_REF_KEY, code.toLowerCase());
}

export async function getPendingRef(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_REF_KEY);
}

export async function clearPendingRef(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_REF_KEY);
}

// ── Share ──────────────────────────────────────────────────────────────────────

export async function shareReferralLink(userId: string): Promise<void> {
  const link = getReferralLink(userId);
  await Share.share({
    message: `¡Entrena táctica de ajedrez conmigo! Descarga Chess Puzzle App: ${link}`,
    url: link,
  });
}

// ── Supabase RPCs ──────────────────────────────────────────────────────────────

/**
 * Called at signup/login: looks for a pending ref in AsyncStorage and
 * creates the referral row via DB RPC. Idempotent — safe to call multiple times.
 */
export async function registerPendingReferral(referredUserId: string): Promise<void> {
  const refCode = await getPendingRef();
  if (!refCode) return;

  const { data } = await supabase.rpc('register_referral', {
    p_ref_code:    refCode,
    p_referred_id: referredUserId,
  });

  if (data) await clearPendingRef();
}

/**
 * Called after each puzzle solve for authenticated (non-guest) users.
 * The DB function increments the referred user's puzzle count and activates
 * the referral + rewards the referrer once the threshold is reached.
 */
export async function trackReferralPuzzle(userId: string): Promise<void> {
  await supabase.rpc('track_referral_puzzle', { p_referred_id: userId });
}

/**
 * Sync premium_until from Supabase profiles and update local store.
 * Called on login so referral rewards persist across reinstalls.
 */
export async function syncReferralPremium(userId: string): Promise<void> {
  const { data } = await supabase
    .from('profiles')
    .select('premium_until')
    .eq('id', userId)
    .single();

  if (data?.premium_until) {
    useUserStore.getState().setPremiumUntil(data.premium_until as string);
  }
}

/** Load referral stats where the current user is the referrer. */
export async function loadReferralStats(referrerId: string): Promise<{
  total: number;
  activated: number;
}> {
  const { data } = await supabase
    .from('referrals')
    .select('activated')
    .eq('referrer_id', referrerId);

  if (!data) return { total: 0, activated: 0 };
  return {
    total:     data.length,
    activated: data.filter((r) => r.activated as boolean).length,
  };
}
