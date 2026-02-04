import { TRPCError } from '@trpc/server';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
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

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
): void {
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

// For testing - clear the store
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

// Predefined rate limit configs
export const RATE_LIMITS = {
  execute: { windowMs: 60000, maxRequests: 10 },  // 10 executions per minute
  generate: { windowMs: 60000, maxRequests: 5 },  // 5 generations per minute
  webhook: { windowMs: 1000, maxRequests: 100 },  // 100 webhooks per second
  api: { windowMs: 60000, maxRequests: 100 },     // 100 API calls per minute
} as const;
