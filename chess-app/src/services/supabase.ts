import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL     ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const _missing: string[] = [];
if (!supabaseUrl)     _missing.push('EXPO_PUBLIC_SUPABASE_URL');
if (!supabaseAnonKey) _missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

/** Non-null when required env vars are absent. Checked in RootLayout before rendering. */
export const SUPABASE_CONFIG_ERROR: string | null = _missing.length
  ? `Missing env vars: ${_missing.join(', ')}`
  : null;

export const supabase = createClient(
  supabaseUrl     || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

export async function testConnection(): Promise<boolean> {
  const { error } = await supabase
    .from('puzzles')
    .select('id', { count: 'exact', head: true });
  return error === null;
}
