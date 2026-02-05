import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

// Routes that support API key authentication (in addition to session auth)
const isApiKeyRoute = createRouteMatcher([
  '/api/baleybots(.*)',
  '/api/trpc/baleybots(.*)',
  '/api/v1(.*)',
]);

// Routes exempt from CSRF checks (use their own auth mechanisms)
const isCsrfExempt = createRouteMatcher([
  '/api/webhooks(.*)',  // Secret-based auth
  '/api/v1(.*)',        // API key auth
  '/api/cron(.*)',      // Bearer token auth
]);

export default clerkMiddleware(async (auth, request) => {
  // CSRF protection: validate Origin for mutation requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && !isCsrfExempt(request)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Allow API key authenticated requests to pass through
  // The route handlers will validate the API key
  if (isApiKeyRoute(request)) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer bui_')) {
      // API key present - skip Clerk auth, let route handler validate
      return;
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
