import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Public routes that don't require authentication
const publicPaths = ['/', '/sign-in', '/sign-up', '/api/webhooks', '/api/health', '/api/auth'];

function isPublicRoute(pathname: string): boolean {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(path + '/') || pathname.startsWith(path + '?'));
}

// API routes handle their own auth (tRPC context, auth() checks, API key validation)
function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api') || pathname.startsWith('/trpc');
}

// Routes that support API key authentication
function isApiKeyRoute(pathname: string): boolean {
  return pathname.startsWith('/api/baleybots') || pathname.startsWith('/api/trpc/baleybots') || pathname.startsWith('/api/v1');
}

// Routes exempt from CSRF checks
function isCsrfExempt(pathname: string): boolean {
  return (
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/baleybots') ||
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/auth')
  );
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Add request ID for tracing
  const requestId = request.headers.get('x-request-id') ?? globalThis.crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // CSRF protection: validate Origin for mutation requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && !isCsrfExempt(pathname)) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');

    if (origin && host) {
      try {
        const originHost = new URL(origin).host;
        if (originHost !== host) {
          return NextResponse.json(
            { error: 'Forbidden', requestId },
            { status: 403, headers: { 'x-request-id': requestId } }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Forbidden', requestId },
          { status: 403, headers: { 'x-request-id': requestId } }
        );
      }
    } else if (referer && host) {
      try {
        const refererHost = new URL(referer).host;
        if (refererHost !== host) {
          return NextResponse.json(
            { error: 'Forbidden', requestId },
            { status: 403, headers: { 'x-request-id': requestId } }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'Forbidden', requestId },
          { status: 403, headers: { 'x-request-id': requestId } }
        );
      }
    } else if (host) {
      return NextResponse.json(
        { error: 'Forbidden', requestId },
        { status: 403, headers: { 'x-request-id': requestId } }
      );
    }
  }

  // Allow API key authenticated requests to pass through
  if (isApiKeyRoute(pathname)) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer bui_')) {
      const apiKeyResponse = NextResponse.next({
        request: { headers: requestHeaders },
      });
      apiKeyResponse.headers.set('x-request-id', requestId);
      return apiKeyResponse;
    }
  }

  // For protected non-API routes, check for session cookie
  if (!isPublicRoute(pathname) && !isApiRoute(pathname)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('redirect_url', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Propagate request ID to response headers
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
