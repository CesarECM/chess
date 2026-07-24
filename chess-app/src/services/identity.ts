import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chess_app_guest_id';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cached: string | null = null;

/**
 * Returns a stable guest UUID, creating and persisting one on first call.
 * In-memory cached after the first AsyncStorage read.
 * Replaced by the real Supabase user ID once auth is implemented (S6).
 */
export async function getOrCreateGuestId(): Promise<string> {
  if (cached) return cached;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    cached = stored;
    return stored;
  }
  const id = generateUUID();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  cached = id;
  return id;
}
