// Supabase Edge Function — handles Stripe webhook events.
// Deploy: supabase functions deploy stripe-webhook
// Configure in Stripe Dashboard: https://dashboard.stripe.com/webhooks
// Events to listen: checkout.session.completed, customer.subscription.deleted
// Env vars required: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req: Request) => {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    console.error('[stripe-webhook] signature error:', err);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.CheckoutSession;
      const userId  = session.metadata?.userId;
      if (userId) {
        await supabase
          .from('profiles')
          .update({ is_premium: true })
          .eq('id', userId);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      // For MVP: premium revocation is handled manually via Stripe Dashboard.
      // In production, store stripe_customer_id in profiles and look up here.
      console.log('[stripe-webhook] subscription deleted:', event.data.object);
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return Response.json({ received: true });
});
