/**
 * Error Types for Execution Engine
 *
 * Production-grade error handling with proper typing, serialization,
 * and context tracking for debugging and recovery.
 */

export enum ErrorCode {
  // Generic errors
  UNKNOWN = 'UNKNOWN',
  EXECUTION_FAILED = 'EXECUTION_FAILED',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_OUTPUT = 'INVALID_OUTPUT',
  SCHEMA_MISMATCH = 'SCHEMA_MISMATCH',

  // Provider errors
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
  PROVIDER_AUTH_FAILED = 'PROVIDER_AUTH_FAILED',
  PROVIDER_INVALID_REQUEST = 'PROVIDER_INVALID_REQUEST',

  // Timeout errors
  TIMEOUT = 'TIMEOUT',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_FAILED = 'CONNECTION_FAILED',

  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',

  // Execution errors
  NODE_NOT_FOUND = 'NODE_NOT_FOUND',
  EXECUTOR_NOT_FOUND = 'EXECUTOR_NOT_FOUND',
  EXECUTION_CANCELLED = 'EXECUTION_CANCELLED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
}

export interface ErrorContext {
  nodeId?: string;
  nodeType?: string;
  flowId?: string;
  executionId?: string;
  provider?: string;
  model?: string;
  attempt?: number;
  maxAttempts?: number;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * Base execution error class
 */
export class ExecutionError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly isRetryable: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.EXECUTION_FAILED,
    context: ErrorContext = {},
    isRetryable = false
  ) {
    super(message);
    this.name = 'ExecutionError';
    this.code = code;
    this.context = {
      ...context,
      timestamp: new Date().toISOString(),
    };
    this.isRetryable = isRetryable;
    this.timestamp = this.context.timestamp!;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging or transmission
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Get suggested remediation actions
   */
  getRemediationSuggestions(): string[] {
    return ['Please try again or contact support if the issue persists.'];
  }
}

/**
 * Retryable error for transient failures
 */
export class RetryableError extends ExecutionError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.EXECUTION_FAILED,
    context: ErrorContext = {}
  ) {
    super(message, code, context, true);
    this.name = 'RetryableError';
  }

  getRemediationSuggestions(): string[] {
    const suggestions = ['This is a transient error that can be retried.'];

    if (this.context.attempt && this.context.maxAttempts) {
      suggestions.push(
        `Retry attempt ${this.context.attempt} of ${this.context.maxAttempts}`
      );
    }

    return suggestions;
  }
}

/**
 * Provider error for AI provider issues
 */
export class ProviderError extends ExecutionError {
  public readonly provider: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    provider: string,
    code: ErrorCode = ErrorCode.PROVIDER_ERROR,
    context: ErrorContext = {},
    statusCode?: number
  ) {
    super(message, code, { ...context, provider }, isRetryableStatusCode(statusCode));
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
  }

  getUserMessage(): string {
    if (this.code === ErrorCode.PROVIDER_RATE_LIMIT) {
      return `Rate limit exceeded for ${this.provider}. Please try again in a few moments.`;
    }
    if (this.code === ErrorCode.PROVIDER_AUTH_FAILED) {
      return `Authentication failed for ${this.provider}. Please check your API key.`;
    }
    if (this.code === ErrorCode.PROVIDER_UNAVAILABLE) {
      return `${this.provider} is currently unavailable. Please try again later.`;
    }
    return `Error from ${this.provider}: ${this.message}`;
  }

  getRemediationSuggestions(): string[] {
    const suggestions: string[] = [];

    switch (this.code) {
      case ErrorCode.PROVIDER_RATE_LIMIT:
        suggestions.push('Wait a few moments before retrying');
        suggestions.push('Consider upgrading your API plan for higher rate limits');
        break;
      case ErrorCode.PROVIDER_AUTH_FAILED:
        suggestions.push('Check that your API key is valid and not expired');
        suggestions.push('Verify the API key has the necessary permissions');
        suggestions.push('Update your connection settings');
        break;
      case ErrorCode.PROVIDER_UNAVAILABLE:
        suggestions.push('Check the provider status page');
        suggestions.push('Try again in a few minutes');
        break;
      case ErrorCode.PROVIDER_INVALID_REQUEST:
        suggestions.push('Check your model configuration');
        suggestions.push('Verify the input format is correct');
        break;
      default:
        suggestions.push('Check the provider documentation');
        suggestions.push('Try again or use a different provider');
    }

    return suggestions;
  }
}

/**
 * Validation error for input/output schema failures
 */
export class ValidationError extends ExecutionError {
  public readonly validationErrors: unknown[];

  constructor(
    message: string,
    validationErrors: unknown[] = [],
    context: ErrorContext = {}
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, context, false);
    this.name = 'ValidationError';
    this.validationErrors = validationErrors;
  }

  getUserMessage(): string {
    return `Validation failed: ${this.message}`;
  }

  getRemediationSuggestions(): string[] {
    return [
      'Check that your input matches the expected schema',
      'Review the validation errors below',
      'Update your block configuration if needed',
    ];
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      validationErrors: this.validationErrors,
    };
  }
}

/**
 * Timeout error for execution timeouts
 */
export class TimeoutError extends ExecutionError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    context: ErrorContext = {}
  ) {
    super(message, ErrorCode.EXECUTION_TIMEOUT, context, true);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }

  getUserMessage(): string {
    return `Execution timed out after ${this.timeoutMs}ms`;
  }

  getRemediationSuggestions(): string[] {
    return [
      'The operation took too long to complete',
      'Consider breaking down complex operations into smaller steps',
      'Check if the provider is experiencing delays',
      'Try again as this may be a transient issue',
    ];
  }
}

/**
 * Circuit breaker error when circuit is open
 */
export class CircuitBreakerError extends ExecutionError {
  public readonly provider: string;

  constructor(provider: string, context: ErrorContext = {}) {
    super(
      `Circuit breaker is open for ${provider}. Too many recent failures.`,
      ErrorCode.CIRCUIT_OPEN,
      { ...context, provider },
      false
    );
    this.name = 'CircuitBreakerError';
    this.provider = provider;
  }

  getUserMessage(): string {
    return `${this.provider} is temporarily unavailable due to multiple failures. Please try again in a few moments.`;
  }

  getRemediationSuggestions(): string[] {
    return [
      'The circuit breaker has detected multiple failures',
      'Wait 30 seconds before trying again',
      'Check the provider status',
      'Consider using a different provider temporarily',
    ];
  }
}

/**
 * Helper function to determine if a status code is retryable
 */
function isRetryableStatusCode(statusCode?: number): boolean {
  if (!statusCode) return false;

  // 429 - Rate limit (retryable)
  // 5xx - Server errors (retryable)
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

/**
 * Parse an error into a typed ExecutionError
 */
export function parseError(
  error: unknown,
  context: ErrorContext = {}
): ExecutionError {
  // Already an ExecutionError
  if (error instanceof ExecutionError) {
    return error;
  }

  // Standard Error
  if (error instanceof Error) {
    // Check for timeout errors
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      return new TimeoutError(error.message, 30000, context);
    }

    // Check for network errors
    if (
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    ) {
      return new RetryableError(
        error.message,
        ErrorCode.NETWORK_ERROR,
        context
      );
    }

    // Generic error
    return new ExecutionError(
      error.message,
      ErrorCode.EXECUTION_FAILED,
      context,
      false
    );
  }

  // Unknown error type
  const message = typeof error === 'string' ? error : 'An unknown error occurred';
  return new ExecutionError(message, ErrorCode.UNKNOWN, context, false);
}

/**
 * Create a provider error from an HTTP response or error
 */
export function createProviderError(
  provider: string,
  error: unknown,
  context: ErrorContext = {}
): ProviderError {
  // If it's already a provider error, return it
  if (error instanceof ProviderError) {
    return error;
  }

  // Try to extract status code and message from various error formats
  let message = 'Provider request failed';
  let statusCode: number | undefined;
  let code = ErrorCode.PROVIDER_ERROR;

  if (error && typeof error === 'object') {
    // Check for status code
    if ('status' in error && typeof error.status === 'number') {
      statusCode = error.status;
    } else if ('statusCode' in error && typeof error.statusCode === 'number') {
      statusCode = error.statusCode;
    }

    // Check for message
    if ('message' in error && typeof error.message === 'string') {
      message = error.message;
    } else if ('error' in error && typeof error.error === 'string') {
      message = error.error;
    }

    // Determine error code based on status
    if (statusCode === 401 || statusCode === 403) {
      code = ErrorCode.PROVIDER_AUTH_FAILED;
    } else if (statusCode === 429) {
      code = ErrorCode.PROVIDER_RATE_LIMIT;
    } else if (statusCode === 400 || statusCode === 422) {
      code = ErrorCode.PROVIDER_INVALID_REQUEST;
    } else if (statusCode && statusCode >= 500) {
      code = ErrorCode.PROVIDER_UNAVAILABLE;
    }
  } else if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return new ProviderError(message, provider, code, context, statusCode);
}
