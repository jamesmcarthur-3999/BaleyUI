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
 * - 'redis': Distributed rate limiting via Upstash Redis (production)
 * - 'memory': In-memory store (development only, won't work on serverless)
 * - 'disabled': No rate limiting (set RATE_LIMIT_DISABLED=true)
 */
type RateLimitMode = 'redis' | 'memory' | 'disabled';

function getRateLimitModeFromEnv(): RateLimitMode {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return 'disabled';
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return 'redis';
  return 'memory';
}

const RATE_LIMIT_MODE = getRateLimitModeFromEnv();

// In-memory store (for development only)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Lazy cleanup: evict expired entries during rate limit checks instead of a global interval.
// This avoids a leaked setInterval that runs forever in serverless environments.
function evictExpired(): void {
  const now = Date.now();
  // Only clean up if the store has grown significantly (avoid O(n) on every check)
  if (rateLimitStore.size > 100) {
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }
}

// ============================================================================
// Upstash Redis Rate Limiting (Production)
// ============================================================================

/**
 * Upstash Redis rate limiting using their REST API.
 * Uses sorted set sliding window algorithm.
 * Fails open (allows request) if Redis is unavailable.
 */
async function checkUpstashRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ limited: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;

  const key = `ratelimit:${identifier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    // Pipeline: ZREMRANGEBYSCORE (cleanup), ZADD (add current), ZCARD (count), PEXPIRE (TTL)
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['ZREMRANGEBYSCORE', key, '0', String(windowStart)],
        ['ZADD', key, String(now), `${now}:${Math.random().toString(36).slice(2)}`],
        ['ZCARD', key],
        ['PEXPIRE', key, String(config.windowMs)],
      ]),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Fail open if Redis is down
      return { limited: false, remaining: config.maxRequests, resetAt: now + config.windowMs };
    }

    const results = await response.json() as { result: number }[];
    const count = results[2]?.result ?? 0;

    if (count > config.maxRequests) {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      return {
        limited: true,
        remaining: 0,
        resetAt: now + config.windowMs,
        retryAfter,
      };
    }

    return {
      limited: false,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt: now + config.windowMs,
    };
  } catch {
    // Fail open on error
    return { limited: false, remaining: config.maxRequests, resetAt: now + config.windowMs };
  }
}

// ============================================================================
// In-Memory Rate Limit Check
// ============================================================================

function checkMemoryRateLimit(
  identifier: string,
  config: RateLimitConfig
): { limited: boolean; remaining: number; resetAt: number; retryAfter?: number } {
  evictExpired();
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

// ============================================================================
// Rate Limit Check (tRPC)
// ============================================================================

/**
 * Check if a request should be rate limited.
 * Uses Redis in production (when UPSTASH env vars are set), memory in dev.
 *
 * @param identifier - Unique identifier for the rate limit (e.g., workspaceId:endpoint)
 * @param config - Rate limit configuration
 * @throws TRPCError with code 'TOO_MANY_REQUESTS' if rate limit exceeded
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
): Promise<void> {
  if (RATE_LIMIT_MODE === 'disabled') {
    return;
  }

  let result: { limited: boolean; retryAfter?: number };

  if (RATE_LIMIT_MODE === 'redis') {
    result = await checkUpstashRateLimit(identifier, config);
  } else {
    result = checkMemoryRateLimit(identifier, config);
  }

  if (result.limited) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Retry after ${result.retryAfter ?? 60} seconds.`,
    });
  }
}

/**
 * Synchronous rate limit check (memory only, for backwards compatibility).
 * Use checkRateLimit (async) for Redis-backed rate limiting.
 */
export function checkRateLimitSync(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 10 }
): void {
  if (RATE_LIMIT_MODE === 'disabled') {
    return;
  }

  const result = checkMemoryRateLimit(identifier, config);
  if (result.limited) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Rate limit exceeded. Retry after ${result.retryAfter ?? 60} seconds.`,
    });
  }
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
export function getRateLimitMode(): RateLimitMode {
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
  creatorMessage: { windowMs: 60000, maxRequests: 10 },  // 10 creator AI calls per minute
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
 * Uses Redis in production, memory in dev.
 *
 * @param identifier - Unique identifier for the rate limit (e.g., IP:endpoint)
 * @param config - Rate limit configuration
 * @returns RateLimitResult with limited status and headers info
 */
export async function checkApiRateLimit(
  identifier: string,
  config: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }
): Promise<RateLimitResult> {
  if (RATE_LIMIT_MODE === 'disabled') {
    return {
      limited: false,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  if (RATE_LIMIT_MODE === 'redis') {
    return checkUpstashRateLimit(identifier, config);
  }

  return checkMemoryRateLimit(identifier, config);
}
