/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by tracking error rates per provider.
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing)
 *
 * - Open circuit after 5 failures in 60 seconds
 * - Half-open after 30 seconds to test recovery
 * - Close circuit after successful test
 */

import { CircuitBreakerError, type ErrorContext } from './errors';
import { createLogger } from '@/lib/logger';

const logger = createLogger('circuit-breaker');

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Too many failures, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening circuit (default: 5)
   */
  failureThreshold?: number;

  /**
   * Time window in ms to track failures (default: 60000 = 1 minute)
   */
  failureWindowMs?: number;

  /**
   * Time to wait before attempting half-open state (default: 30000 = 30 seconds)
   */
  resetTimeoutMs?: number;

  /**
   * Number of successful calls needed in half-open to close (default: 3)
   */
  successThreshold?: number;

  /**
   * Maximum concurrent requests allowed in half-open state (default: 3)
   */
  halfOpenMaxConcurrent?: number;
}

interface FailureRecord {
  timestamp: number;
  error: string;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private successes = 0;
  private halfOpenInFlight = 0;
  private openedAt?: number;
  private lastFailureTime?: number;
  private lastCleanedAt = 0;

  constructor(
    public readonly name: string,
    private readonly config: Required<CircuitBreakerConfig>
  ) {}

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Check if the circuit allows a request
   */
  canExecute(): boolean {
    this.updateState();
    if (this.state === CircuitState.OPEN) {
      return false;
    }
    if (this.state === CircuitState.HALF_OPEN) {
      return this.halfOpenInFlight < this.config.halfOpenMaxConcurrent;
    }
    return true;
  }

  /**
   * Record an attempt (increments in-flight count for half-open state)
   */
  recordAttempt(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenInFlight++;
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.cleanOldFailures();
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(error: string): void {
    const now = Date.now();
    this.lastFailureTime = now;

    this.failures.push({
      timestamp: now,
      error,
    });

    this.cleanOldFailures();

    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.config.failureThreshold) {
        this.open();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Failed during test, go back to open
      this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      this.open();
    }
  }

  /**
   * Get statistics about the circuit breaker
   */
  getStats() {
    this.cleanOldFailures();
    return {
      state: this.state,
      failureCount: this.failures.length,
      successCount: this.successes,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
      recentFailures: this.failures.slice(-5).map((f) => ({
        timestamp: new Date(f.timestamp).toISOString(),
        error: f.error,
      })),
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.close();
  }

  /**
   * Update state based on time elapsed
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN && this.openedAt) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.halfOpen();
      }
    }

    this.cleanOldFailures();
  }

  /**
   * Open the circuit (stop allowing requests)
   */
  private open(): void {
    logger.warn(`Opening circuit for ${this.name}`, {
      failureCount: this.failures.length,
      threshold: this.config.failureThreshold,
    });

    this.state = CircuitState.OPEN;
    this.openedAt = Date.now();
    this.successes = 0;
    this.halfOpenInFlight = 0;
  }

  /**
   * Half-open the circuit (test if service recovered)
   */
  private halfOpen(): void {
    logger.info(`Half-opening circuit for ${this.name}`);
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
  }

  /**
   * Close the circuit (normal operation)
   */
  private close(): void {
    if (this.state !== CircuitState.CLOSED) {
      logger.info(`Closing circuit for ${this.name}`);
    }
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.successes = 0;
    this.halfOpenInFlight = 0;
    this.openedAt = undefined;
  }

  /**
   * Remove failures outside the time window.
   * Throttled to run at most once per second for performance.
   */
  private cleanOldFailures(): void {
    const now = Date.now();
    if (now - this.lastCleanedAt < 1000) return;
    this.lastCleanedAt = now;
    const cutoff = now - this.config.failureWindowMs;
    // In-place removal: failures are sorted by timestamp, so find cutoff index
    let i = 0;
    while (i < this.failures.length && this.failures[i]!.timestamp <= cutoff) i++;
    if (i > 0) this.failures.splice(0, i);
  }
}

/**
 * Global circuit breaker registry
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: Required<CircuitBreakerConfig> = {
    failureThreshold: 5,
    failureWindowMs: 60000, // 1 minute
    resetTimeoutMs: 30000,  // 30 seconds
    successThreshold: 3,
    halfOpenMaxConcurrent: 3,
  };

  /**
   * Get or create a circuit breaker for a provider
   */
  getBreaker(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      this.breakers.set(name, new CircuitBreaker(name, mergedConfig));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Check if a circuit breaker exists
   */
  hasBreaker(name: string): boolean {
    return this.breakers.has(name);
  }

  /**
   * Get all circuit breakers
   */
  getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Reset a circuit breaker
   */
  resetBreaker(name: string): void {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats() {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }
}

// Global registry instance
const registry = new CircuitBreakerRegistry();

/**
 * Execute a function with circuit breaker protection
 *
 * @example
 * const result = await withCircuitBreaker(
 *   'openai',
 *   async () => callOpenAI(),
 *   { failureThreshold: 5 }
 * );
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  config?: CircuitBreakerConfig,
  context?: ErrorContext
): Promise<T> {
  const breaker = registry.getBreaker(name, config);

  // Check if circuit allows execution
  if (!breaker.canExecute()) {
    throw new CircuitBreakerError(name, context);
  }

  breaker.recordAttempt();

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    breaker.recordFailure(errorMessage);
    throw error;
  }
}

/**
 * Create a circuit-breaker-protected wrapper for a function
 *
 * @example
 * const protectedAPICall = createProtected('openai', callOpenAI);
 * const result = await protectedAPICall();
 */
export function createProtected<T extends unknown[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
  config?: CircuitBreakerConfig
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    return withCircuitBreaker(name, () => fn(...args), config);
  };
}

/**
 * Get the state of a circuit breaker
 */
export function getCircuitState(name: string): CircuitState {
  if (!registry.hasBreaker(name)) {
    return CircuitState.CLOSED;
  }
  return registry.getBreaker(name).getState();
}

/**
 * Check if a circuit breaker is open
 */
export function isCircuitOpen(name: string): boolean {
  return getCircuitState(name) === CircuitState.OPEN;
}

/**
 * Get circuit breaker statistics
 */
export function getCircuitStats(name: string) {
  if (!registry.hasBreaker(name)) {
    return null;
  }
  return registry.getBreaker(name).getStats();
}

/**
 * Get all circuit breaker statistics
 */
export function getAllCircuitStats() {
  return registry.getAllStats();
}

/**
 * Reset a circuit breaker
 */
export function resetCircuit(name: string): void {
  registry.resetBreaker(name);
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuits(): void {
  registry.resetAll();
}

/**
 * Execute a provider call with both circuit breaker and retry protection
 */
export async function executeProtected<T>(
  provider: string,
  fn: () => Promise<T>,
  options?: {
    circuitBreakerConfig?: CircuitBreakerConfig;
    context?: ErrorContext;
  }
): Promise<T> {
  return withCircuitBreaker(
    provider,
    fn,
    options?.circuitBreakerConfig,
    options?.context
  );
}
