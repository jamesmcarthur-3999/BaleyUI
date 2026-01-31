/**
 * BaleyUI SDK Errors
 */

/**
 * Base error class for BaleyUI SDK errors.
 */
export class BaleyUIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'BaleyUIError';
    Object.setPrototypeOf(this, BaleyUIError.prototype);
  }
}

/**
 * Thrown when the API key is invalid or missing.
 */
export class AuthenticationError extends BaleyUIError {
  constructor(message = 'Invalid or missing API key') {
    super(message, 401, 'authentication_error');
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Thrown when the API key doesn't have sufficient permissions.
 */
export class PermissionError extends BaleyUIError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'permission_error');
    this.name = 'PermissionError';
    Object.setPrototypeOf(this, PermissionError.prototype);
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends BaleyUIError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 404, 'not_found');
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Thrown when the request is invalid.
 */
export class ValidationError extends BaleyUIError {
  constructor(message: string, details?: string) {
    super(message, 400, 'validation_error', details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Thrown when rate limits are exceeded.
 */
export class RateLimitError extends BaleyUIError {
  constructor(
    public readonly retryAfter?: number
  ) {
    super('Rate limit exceeded', 429, 'rate_limit_error');
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Thrown when an execution times out.
 */
export class TimeoutError extends BaleyUIError {
  constructor(timeout: number) {
    super(`Execution timed out after ${timeout}ms`, undefined, 'timeout_error');
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Thrown when a connection error occurs.
 */
export class ConnectionError extends BaleyUIError {
  constructor(message = 'Failed to connect to BaleyUI API') {
    super(message, undefined, 'connection_error');
    this.name = 'ConnectionError';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}
