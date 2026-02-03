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

  it('allows requests within limit', () => {
    const config = { windowMs: 1000, maxRequests: 3 };
    expect(() => checkRateLimit('test-1', config)).not.toThrow();
    expect(() => checkRateLimit('test-1', config)).not.toThrow();
    expect(() => checkRateLimit('test-1', config)).not.toThrow();
  });

  it('throws on exceeding limit', () => {
    const config = { windowMs: 1000, maxRequests: 2 };
    checkRateLimit('test-2', config);
    checkRateLimit('test-2', config);
    expect(() => checkRateLimit('test-2', config)).toThrow('Rate limit exceeded');
  });

  it('resets after window expires', () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    checkRateLimit('test-3', config);
    vi.advanceTimersByTime(1001);
    expect(() => checkRateLimit('test-3', config)).not.toThrow();
  });

  it('tracks different identifiers separately', () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    checkRateLimit('user-1', config);
    expect(() => checkRateLimit('user-2', config)).not.toThrow();
  });

  it('includes retry-after in error message', () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    checkRateLimit('test-retry', config);
    try {
      checkRateLimit('test-retry', config);
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
