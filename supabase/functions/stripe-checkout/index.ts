// Supabase Edge Function — creates a Stripe Checkout Session for the monthly subscription.
// Deploy: supabase functions deploy stripe-checkout
// Env vars required: STRIPE_SECRET_KEY, STRIPE_PRICE_ID

import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const APP_SCHEME = 'chess-app://';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const { userId } = await req.json() as { userId: string };

    if (!userId) {
      return Response.json({ error: 'userId required' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: Deno.env.get('STRIPE_PRICE_ID')!,
          quantity: 1,
        },
      ],
      success_url: `${APP_SCHEME}premium-success`,
      cancel_url:  `${APP_SCHEME}premium-cancel`,
      metadata: { userId },
    });

    return Response.json({ url: session.url }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('[stripe-checkout]', err);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
});
