import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Verify Stripe webhook signature
async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(',').reduce((acc: Record<string, string>, part) => {
      const [k, v] = part.split('=');
      acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts['t'];
    const sigHash = parts['v1'];
    if (!timestamp || !sigHash) return false;

    const payload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const computedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return computedSig === sigHash;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  const valid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response('Invalid signature', { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const userId = session?.client_reference_id;
    const amountTotal = session?.amount_total; // cents

    if (!userId) {
      return new Response(JSON.stringify({ received: true, skipped: 'no client_reference_id' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine plan from amount ($29=pro, $49=elite)
    const plan = amountTotal >= 4800 ? 'elite' : 'pro';
    const minutes = plan === 'elite' ? 150 : 60;

    // Next reset = 1st of next month
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await sb
      .from('ss_users')
      .update({
        plan,
        minutes_total: minutes,
        minutes_remaining: minutes,
        subscription_status: 'active',
        minutes_reset_at: nextReset,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update error:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(`Plan updated: user=${userId} plan=${plan} minutes=${minutes}`);
  }

  if (event.type === 'customer.subscription.deleted') {
    // Downgrade to free when subscription cancelled
    const sub = event.data?.object;
    const email = sub?.customer_email;
    if (email) {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sb
        .from('ss_users')
        .update({
          plan: 'free',
          minutes_total: 15,
          minutes_remaining: 15,
          subscription_status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('email', email);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
