/**
 * Platform Bug Tracking API Wrapper
 *
 * Wraps Next.js API route handlers to automatically capture
 * unhandled platform errors (not user errors).
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportPlatformError } from './report';

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<Response | NextResponse>;

/** Error classes that represent user errors, not platform bugs */
const USER_ERROR_NAMES = new Set([
  'MissingCredentialsError',
  'ZodError',
  'OptimisticLockError',
  'TRPCError',
]);

/** HTTP status codes that are user errors, not platform bugs */
const USER_ERROR_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

function isPlatformError(err: unknown): boolean {
  if (!(err instanceof Error)) return true; // unknown throws are suspicious

  // Known user error classes
  if (USER_ERROR_NAMES.has(err.constructor.name)) return false;

  // TypeError and ReferenceError are always platform bugs
  if (err instanceof TypeError || err instanceof ReferenceError) return true;

  // Rate limit messages are user errors
  if (err.message.toLowerCase().includes('rate limit')) return false;

  // Default: treat as platform error (better to over-report)
  return true;
}

/**
 * Wrap a route handler with platform bug tracking.
 * Catches unhandled errors, reports platform bugs, and re-throws.
 */
export function withPlatformBugTracking(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      const response = await handler(req, ctx);

      // Check for 5xx responses (even if no error was thrown)
      if (response.status >= 500) {
        const route = new URL(req.url).pathname;
        reportPlatformError({
          errorMessage: `API returned ${response.status}`,
          source: 'server',
          category: 'api_5xx',
          route,
          environment: process.env.NODE_ENV ?? 'production',
          metadata: { method: req.method, status: response.status },
        }).catch(() => {}); // fire-and-forget
      }

      return response;
    } catch (err) {
      if (isPlatformError(err)) {
        const route = new URL(req.url).pathname;
        reportPlatformError({
          errorMessage: err instanceof Error ? err.message : String(err),
          stackTrace: err instanceof Error ? err.stack : undefined,
          source: 'server',
          category: 'uncaught_exception',
          route,
          environment: process.env.NODE_ENV ?? 'production',
          metadata: {
            method: req.method,
            errorName: err instanceof Error ? err.constructor.name : 'unknown',
          },
        }).catch(() => {}); // fire-and-forget
      }

      throw err; // re-throw so the original error handling works
    }
  };
}
