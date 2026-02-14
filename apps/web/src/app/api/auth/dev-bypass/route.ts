import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db, eq, user, account, session } from '@baleyui/db';
import { headers } from 'next/headers';

const DEV_EMAIL = 'jamesmcarthur3999@gmail.com';
const DEV_NAME = 'James McArthur';
const DEV_PASSWORD = 'dev-bypass-12345678';

/**
 * Dev-only bypass: creates the dev user (if needed) and signs them in.
 * Returns Set-Cookie headers so the browser is immediately authenticated.
 *
 * NEVER available in production — gated on NODE_ENV.
 */
export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  try {
    // Try to sign in first (user may already exist with matching password)
    const signInResult = await auth.api.signInEmail({
      body: { email: DEV_EMAIL, password: DEV_PASSWORD },
      headers: await headers(),
    });

    if (signInResult) {
      return NextResponse.json({ ok: true, email: DEV_EMAIL });
    }
  } catch {
    // Sign-in failed — user doesn't exist or has a different password.
  }

  // If user exists with a different password, nuke them so we can recreate.
  // This is dev-only so being destructive is fine.
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, DEV_EMAIL));
  if (existing) {
    await db.delete(session).where(eq(session.userId, existing.id));
    await db.delete(account).where(eq(account.userId, existing.id));
    await db.delete(user).where(eq(user.id, existing.id));
  }

  try {
    await auth.api.signUpEmail({
      body: { email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME },
      headers: await headers(),
    });

    return NextResponse.json({ ok: true, email: DEV_EMAIL, created: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
