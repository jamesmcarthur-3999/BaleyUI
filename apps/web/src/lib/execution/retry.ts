/**
 * Retry Logic with Exponential Backoff
 *
 * Provides intelligent retry logic for transient failures with:
 * - Exponential backoff: 1s, 2s, 4s, 8s (max 30s)
 * - Configurable max retries
 * - Smart error classification
 * - Detailed logging
 */

import {
  ExecutionError,
  RetryableError,
  ProviderError,
  TimeoutError,
  ErrorCode,
  type ErrorContext,
  parseError,
} from './errors';

export interface RetryOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxAttempts?: number;

  /**
   * Initial delay in milliseconds (default: 1000)
   */
  initialDelayMs?: number;

  /**
   * Maximum delay in milliseconds (default: 30000)
   */
  maxDelayMs?: number;

  /**
   * Backoff multiplier (default: 2 for exponential backoff)
   */
  backoffMultiplier?: number;

  /**
   * Additional context to include in errors
   */
  context?: ErrorContext;

  /**
   * Custom function to determine if an error should be retried
   */
  shouldRetry?: (error: ExecutionError, attempt: number) => boolean;

  /**
   * Callback called before each retry
   */
  onRetry?: (error: ExecutionError, attempt: number, delayMs: number) => void;

  /**
   * AbortSignal to cancel retries
   */
  signal?: AbortSignal;
}

/**
 * Default retry strategy - only retry on transient errors
 */
function defaultShouldRetry(error: ExecutionError, attempt: number): boolean {
  // Don't retry if max attempts reached (checked elsewhere)
  // Don't retry validation errors
  if (error.code === ErrorCode.VALIDATION_FAILED) {
    return false;
  }

  // Don't retry authentication errors
  if (error.code === ErrorCode.PROVIDER_AUTH_FAILED) {
    return false;
  }

  // Don't retry invalid request errors (4xx client errors)
  if (error.code === ErrorCode.PROVIDER_INVALID_REQUEST) {
    return false;
  }

  // Don't retry circuit breaker errors
  if (error.code === ErrorCode.CIRCUIT_OPEN) {
    return false;
  }

  // Don't retry resource not found errors
  if (error.code === ErrorCode.RESOURCE_NOT_FOUND) {
    return false;
  }

  // Don't retry execution cancelled errors
  if (error.code === ErrorCode.EXECUTION_CANCELLED) {
    return false;
  }

  // Retry if the error is explicitly marked as retryable
  if (error.isRetryable) {
    return true;
  }

  // Retry on specific error codes
  const retryableCodes = [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.CONNECTION_FAILED,
    ErrorCode.PROVIDER_RATE_LIMIT,
    ErrorCode.PROVIDER_UNAVAILABLE,
    ErrorCode.TIMEOUT,
    ErrorCode.EXECUTION_TIMEOUT,
    ErrorCode.RESOURCE_EXHAUSTED,
  ];

  return retryableCodes.includes(error.code);
}

/**
 * Calculate delay for a given attempt using exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  return Math.min(delay, maxDelayMs);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
    });
  });
}

/**
 * Wrap a function with retry logic
 *
 * @example
 * const result = await withRetry(
 *   async () => callAPIProvider(),
 *   { maxAttempts: 3, context: { provider: 'openai' } }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    context = {},
    shouldRetry = defaultShouldRetry,
    onRetry,
    signal,
  } = options;

  let lastError: ExecutionError | undefined;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    try {
      // Check for cancellation
      if (signal?.aborted) {
        throw new ExecutionError(
          'Execution cancelled',
          ErrorCode.EXECUTION_CANCELLED,
          context
        );
      }

      // Execute the function
      return await fn();
    } catch (error) {
      // Parse the error into a typed ExecutionError
      const executionError = parseError(error, {
        ...context,
        attempt,
        maxAttempts,
      });

      lastError = executionError;

      // Check if we should retry
      const isLastAttempt = attempt >= maxAttempts;
      const shouldRetryError = shouldRetry(executionError, attempt);

      // If this is the last attempt or we shouldn't retry, throw
      if (isLastAttempt || !shouldRetryError) {
        throw executionError;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier
      );

      // Call retry callback if provided
      if (onRetry) {
        try {
          onRetry(executionError, attempt, delayMs);
        } catch (callbackError) {
          // Don't let callback errors break retry logic
          console.error('Error in onRetry callback:', callbackError);
        }
      }

      // Log the retry attempt
      console.warn(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`,
        {
          error: executionError.message,
          code: executionError.code,
          context: executionError.context,
        }
      );

      // Wait before retrying
      try {
        await sleep(delayMs, signal);
      } catch (sleepError) {
        // If sleep was aborted, throw cancellation error
        throw new ExecutionError(
          'Execution cancelled during retry',
          ErrorCode.EXECUTION_CANCELLED,
          context
        );
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw (
    lastError ||
    new ExecutionError(
      'Retry loop exited unexpectedly',
      ErrorCode.UNKNOWN,
      context
    )
  );
}

/**
 * Create a retryable wrapper for a function
 *
 * @example
 * const retryableAPICall = createRetryable(callAPIProvider, {
 *   maxAttempts: 3,
 *   context: { provider: 'openai' }
 * });
 *
 * const result = await retryableAPICall();
 */
export function createRetryable<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: RetryOptions = {}
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    return withRetry(() => fn(...args), options);
  };
}

/**
 * Retry a provider API call with provider-specific error handling
 */
export async function retryProviderCall<T>(
  provider: string,
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'context'> & { context?: Omit<ErrorContext, 'provider'> } = {}
): Promise<T> {
  return withRetry(fn, {
    ...options,
    context: {
      ...options.context,
      provider,
    },
    shouldRetry: (error, attempt) => {
      // Don't retry authentication errors
      if (error.code === ErrorCode.PROVIDER_AUTH_FAILED) {
        return false;
      }

      // For rate limits, always retry with exponential backoff
      if (error.code === ErrorCode.PROVIDER_RATE_LIMIT) {
        return true;
      }

      // Use default retry logic for other errors
      return defaultShouldRetry(error, attempt);
    },
  });
}

/**
 * Get the next retry delay for displaying to users
 */
export function getNextRetryDelay(
  attempt: number,
  options: Partial<RetryOptions> = {}
): number {
  const {
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;

  return calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier);
}

/**
 * Format retry delay for display
 */
export function formatRetryDelay(delayMs: number): string {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  }
  const seconds = Math.round(delayMs / 1000);
  return `${seconds}s`;
}
