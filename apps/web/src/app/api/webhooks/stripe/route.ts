/**
 * Stripe Webhook Handler
 *
 * Delegates all event processing to the billing service.
 * This is the only file that touches the Stripe SDK directly
 * (besides billing/service.ts).
 */

import { NextResponse } from 'next/server';
import { handleWebhookEvent } from '@/lib/billing/service';

/**
 * Simple in-memory idempotency guard for webhook event IDs.
 * Prevents duplicate processing when Stripe retries or delivers twice.
 * Events expire after 10 minutes to prevent unbounded growth.
 */
const processedEvents = new Map<string, number>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes

function markEventProcessed(eventId: string): boolean {
  const now = Date.now();
  // Lazy cleanup: purge expired entries when map grows large
  if (processedEvents.size > 500) {
    for (const [id, timestamp] of processedEvents) {
      if (now - timestamp > IDEMPOTENCY_TTL_MS) {
        processedEvents.delete(id);
      }
    }
  }

  if (processedEvents.has(eventId)) {
    return false; // Already processed
  }

  processedEvents.set(eventId, now);
  return true; // First time processing
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    const stripe = new Stripe(stripeSecretKey);

    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    // Idempotency check: skip already-processed events
    if (!markEventProcessed(event.id)) {
      return NextResponse.json({ received: true, deduplicated: true });
    }

    await handleWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error';
    console.error('[stripe-webhook]', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
