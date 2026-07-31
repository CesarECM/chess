import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from './supabase';
import type { User } from '@/types';

WebBrowser.maybeCompleteAuthSession();

export interface Profile {
  id: string;
  email: string | null;
  elo: number;
  isCalibrated: boolean;
  preEloLow: number | null;
  preEloHigh: number | null;
  isPremium: boolean;
  streakCurrent: number;
  streakLongest: number;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, elo, is_calibrated, pre_elo_low, pre_elo_high, is_premium, streak_current, streak_longest')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    elo: data.elo,
    isCalibrated: data.is_calibrated,
    preEloLow:  (data.pre_elo_low  as number | null) ?? (data.is_calibrated ? null : 400),
    preEloHigh: (data.pre_elo_high as number | null) ?? (data.is_calibrated ? null : 3300),
    isPremium: data.is_premium,
    streakCurrent: data.streak_current,
    streakLongest: data.streak_longest,
  };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const redirectTo = makeRedirectUri();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') return;

  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }
}

export function onAuthStateChange(
  callback: (event: string, user: User | null) => void,
) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const user: User = {
        id: session.user.id,
        email: session.user.email,
        isGuest: false,
        elo: 800,
        createdAt: session.user.created_at,
      };
      callback(event, user);
    } else {
      callback(event, null);
    }
  });
}
