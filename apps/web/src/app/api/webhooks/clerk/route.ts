import { Webhook } from 'svix';
import { headers } from 'next/headers';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { db, workspaces } from '@baleyui/db';

export async function POST(req: Request) {
  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

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
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
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

      console.log(`Created workspace for user ${id}`);
    } catch (error) {
      console.error('Error creating workspace:', error);
      // Don't fail the webhook - Clerk might retry
      // The workspace can be created lazily if needed
    }
  }

  return new Response('OK', { status: 200 });
}
