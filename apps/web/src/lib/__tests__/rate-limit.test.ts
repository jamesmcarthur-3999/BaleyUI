import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkRateLimit, clearRateLimitStore, RATE_LIMITS } from '../rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    clearRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', async () => {
    const config = { windowMs: 1000, maxRequests: 3 };
    await expect(checkRateLimit('test-1', config)).resolves.not.toThrow();
    await expect(checkRateLimit('test-1', config)).resolves.not.toThrow();
    await expect(checkRateLimit('test-1', config)).resolves.not.toThrow();
  });

  it('throws on exceeding limit', async () => {
    const config = { windowMs: 1000, maxRequests: 2 };
    await checkRateLimit('test-2', config);
    await checkRateLimit('test-2', config);
    await expect(checkRateLimit('test-2', config)).rejects.toThrow('Rate limit exceeded');
  });

  it('resets after window expires', async () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    await checkRateLimit('test-3', config);
    vi.advanceTimersByTime(1001);
    await expect(checkRateLimit('test-3', config)).resolves.not.toThrow();
  });

  it('tracks different identifiers separately', async () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    await checkRateLimit('user-1', config);
    await expect(checkRateLimit('user-2', config)).resolves.not.toThrow();
  });

  it('includes retry-after in error message', async () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    await checkRateLimit('test-retry', config);
    try {
      await checkRateLimit('test-retry', config);
    } catch (e: unknown) {
      expect((e as Error).message).toMatch(/Retry after \d+ seconds/);
    }
  });
});

describe('RATE_LIMITS', () => {
  it('has execute config', () => {
    expect(RATE_LIMITS.execute.maxRequests).toBe(10);
    expect(RATE_LIMITS.execute.windowMs).toBe(60000);
  });
});
