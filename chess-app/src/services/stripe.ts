import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/services/supabase';

export type CheckoutResult = 'success' | 'cancelled' | 'error';

/** Opens Stripe Checkout (web only). Calls the stripe-checkout Edge Function to create the session. */
export async function openStripeCheckout(userId: string): Promise<CheckoutResult> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: { userId },
    });

    if (error || !data?.url) return 'error';

    const result = await WebBrowser.openAuthSessionAsync(
      data.url as string,
      'chess-app://premium-success',
    );

    return result.type === 'success' ? 'success' : 'cancelled';
  } catch {
    return 'error';
  }
}
