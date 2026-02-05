import { Webhook } from 'svix';
import { headers } from 'next/headers';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { db, workspaces } from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { requireEnv } from '@/lib/env';
import { checkApiRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const log = createLogger('clerk-webhook');

/**
 * Extract client IP from request headers
 */
function getClientIp(headerPayload: Headers): string | undefined {
  return (
    headerPayload.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerPayload.get('x-real-ip') ||
    undefined
  );
}

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // Rate limiting: 60 requests per minute per IP
  const ipAddress = getClientIp(headerPayload);
  const rateLimitKey = `webhook:clerk:${ipAddress || 'unknown'}`;
  const rateLimitResult = checkApiRateLimit(rateLimitKey, RATE_LIMITS.webhookPerMinute);

  if (rateLimitResult.limited) {
    log.warn('Rate limit exceeded for Clerk webhook', { ipAddress });
    return new Response(
      JSON.stringify({ error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.` }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': String(RATE_LIMITS.webhookPerMinute.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.resetAt / 1000)),
        },
      }
    );
  }

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing svix headers', {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const webhookSecret = requireEnv('CLERK_WEBHOOK_SECRET', 'Clerk webhook verification');
  const wh = new Webhook(webhookSecret);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    log.error('Error verifying webhook', err);
    return new Response('Error verifying webhook', {
      status: 400,
    });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name, username } = evt.data;

    // Generate a unique slug from email or username
    const primaryEmail = email_addresses.find((e) => e.id === evt.data.primary_email_address_id);
    const emailPart = primaryEmail?.email_address?.split('@')[0] || 'user';
    const baseSlug = username || emailPart;
    const slug = `${baseSlug}-${id.slice(-6)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Create workspace name
    const name = first_name && last_name
      ? `${first_name}'s Workspace`
      : username
        ? `${username}'s Workspace`
        : 'My Workspace';

    try {
      // Create the default workspace for this user
      await db.insert(workspaces).values({
        name,
        slug,
        ownerId: id,
      });

      log.info(`Created workspace for user ${id}`);
    } catch (error) {
      log.error('Error creating workspace', error);
      // Don't fail the webhook - Clerk might retry
      // The workspace can be created lazily if needed
    }
  }

  return new Response('OK', { status: 200 });
}
