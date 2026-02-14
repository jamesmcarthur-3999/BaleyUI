/**
 * Platform Bug Report API Endpoint
 *
 * POST /api/platform-bugs/report
 *
 * Receives client-side error reports from PlatformErrorBoundary.
 * Requires authenticated session to prevent abuse.
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reportPlatformError } from '@/lib/platform-bugs/report';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const reportSchema = z.object({
  errorMessage: z.string().min(1).max(10000),
  stackTrace: z.string().max(50000).optional(),
  source: z.enum(['client', 'server', 'streaming']),
  category: z.string().min(1).max(100),
  route: z.string().max(500).optional(),
  environment: z.string().max(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Require authenticated session
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 10 reports per minute per user
    try {
      await checkRateLimit(`platform-bug-report:${session.user.id}`, RATE_LIMITS.api);
    } catch {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Report the error (fire-and-forget internally)
    await reportPlatformError({
      ...parsed.data,
      environment: parsed.data.environment ?? process.env.NODE_ENV ?? 'production',
    });

    return NextResponse.json({ ok: true });
  } catch {
    // This endpoint must not itself cause errors visible to users
    return NextResponse.json({ ok: true });
  }
}
