import { TRPCError } from '@trpc/server';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ============================================================================
// Rate Limiter Configuration
// ============================================================================

/**
 * Rate limiting mode:
 * - 'memory': In-memory store (development only, won't work on serverless)
 * - 'disabled': No rate limiting (set RATE_LIMIT_DISABLED=true for serverless without KV)
 *
 * For production on Vercel, implement Redis/KV-backed rate limiting using
 * @upstash/ratelimit or similar. This in-memory implementation is provided
 * for development and testing only.
 */
const RATE_LIMIT_MODE = process.env.RATE_LIMIT_DISABLED === 'true'
  ? 'disabled'
  : 'memory';

// In-memory store (for development only)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (only in non-serverless environments)
if (typeof setInterval !== 'undefined' && RATE_LIMIT_MODE === 'memory') {
  setInterval(() => {
    const now = Date.now();
    const entries = Array.from(rateLimitStore.entries());
    for (const [key, entry] of entries) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Cleanup every minute
}

// ============================================================================
// Rate Limit Check
// ============================================================================

/**
 * Check if a request should be rate limited.
 *
 * @param identifier - Unique identifier for the rate limit (e.g., userId, IP)
 * @param config - Rate limit configuration
 * @throws TRPCError with code 'TOO_MANY_REQUESTS' if rate limit exceeded
 *
 * NOTE: In production on Vercel serverless, set RATE_LIMIT_DISABLED=true
 * and implement proper distributed rate limiting with Upstash Redis:
 *
 * ```typescript
 * import { Ratelimit } from '@upstash/ratelimit';
 * import { Redis } from '@upstash/redis';
 *
 * const ratelimit = new Ratelimit({
 *   redis: Redis.fromEnv(),
 *   limiter: Ratelimit.slidingWindow(10, '60 s'),
 * });
 * ```
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
): void {
  // Disabled mode - no rate limiting
  if (RATE_LIMIT_MODE === 'disabled') {
    return;
  }

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return;
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
    });
  }

  entry.count++;
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Clear the rate limit store (for testing only)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Get current rate limit mode
 */
export function getRateLimitMode(): 'memory' | 'disabled' {
  return RATE_LIMIT_MODE;
}

// ============================================================================
// Predefined Rate Limit Configs
// ============================================================================

export const RATE_LIMITS = {
  execute: { windowMs: 60000, maxRequests: 10 },  // 10 executions per minute
  generate: { windowMs: 60000, maxRequests: 5 },  // 5 generations per minute
  webhook: { windowMs: 1000, maxRequests: 100 },  // 100 webhooks per second
  webhookPerMinute: { windowMs: 60000, maxRequests: 60 },  // 60 webhooks per minute per IP
  api: { windowMs: 60000, maxRequests: 100 },     // 100 API calls per minute
} as const;

// ============================================================================
// API Route Rate Limiting (non-tRPC)
// ============================================================================

/**
 * Result of rate limit check for API routes
 */
export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Check rate limit for API routes (non-tRPC).
 * Returns a result object instead of throwing an error.
 *
 * @param identifier - Unique identifier for the rate limit (e.g., IP address)
 * @param config - Rate limit configuration
 * @returns RateLimitResult with limited status and headers info
 */
export function checkApiRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }
): RateLimitResult {
  // Disabled mode - no rate limiting
  if (RATE_LIMIT_MODE === 'disabled') {
    return {
      limited: false,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      limited: false,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      limited: true,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  entry.count++;
  return {
    limited: false,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}
