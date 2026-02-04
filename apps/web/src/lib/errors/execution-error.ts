/**
 * Execution Error
 *
 * Structured error class for BaleyBot execution failures.
 * Provides error codes, context, and recovery hints for better debugging.
 */

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error codes for categorizing execution failures.
 * Use these to programmatically handle specific error types.
 */
export enum ErrorCode {
  // Execution errors
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  EXECUTION_CANCELLED = 'EXECUTION_CANCELLED',

  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_FORBIDDEN = 'TOOL_FORBIDDEN',

  // Approval errors
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_DENIED = 'APPROVAL_DENIED',
  APPROVAL_TIMEOUT = 'APPROVAL_TIMEOUT',

  // Policy errors
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  SPAWN_DEPTH_EXCEEDED = 'SPAWN_DEPTH_EXCEEDED',

  // Resource errors
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  RATE_LIMITED = 'RATE_LIMITED',
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for creating an ExecutionError
 */
export interface ExecutionErrorOptions {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional context about the error */
  context?: Record<string, unknown>;
  /** Original error that caused this one */
  cause?: Error;
  /** Suggestion for how to fix the issue */
  recoveryHint?: string;
}

// ============================================================================
// EXECUTION ERROR CLASS
// ============================================================================

/**
 * Structured error for BaleyBot execution failures.
 *
 * @example
 * ```typescript
 * throw new ExecutionError({
 *   code: ErrorCode.TOOL_EXECUTION_FAILED,
 *   message: 'Failed to execute database_query tool',
 *   context: {
 *     toolName: 'database_query',
 *     baleybotId: 'bb-123',
 *   },
 *   cause: originalError,
 *   recoveryHint: 'Check database connection settings.',
 * });
 * ```
 */
export class ExecutionError extends Error {
  /** Error code for programmatic handling */
  public readonly code: ErrorCode;

  /** Additional context about the error */
  public readonly context: Record<string, unknown>;

  /** Original error that caused this one */
  public readonly cause?: Error;

  /** Suggestion for how to fix the issue */
  public readonly recoveryHint?: string;

  /** When the error occurred */
  public readonly timestamp: Date;

  constructor(options: ExecutionErrorOptions) {
    super(options.message);
    this.name = 'ExecutionError';
    this.code = options.code;
    this.context = options.context ?? {};
    this.cause = options.cause;
    this.recoveryHint = options.recoveryHint;
    this.timestamp = new Date();

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExecutionError);
    }
  }

  /**
   * Convert to JSON for logging/serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoveryHint: this.recoveryHint,
      timestamp: this.timestamp.toISOString(),
      cause: this.cause?.message,
    };
  }

  /**
   * Create a user-friendly error message.
   * Includes recovery hint if available.
   */
  toUserMessage(): string {
    let msg = this.message;
    if (this.recoveryHint) {
      msg += `\n\nSuggestion: ${this.recoveryHint}`;
    }
    return msg;
  }
}

// ============================================================================
// FACTORY HELPERS
// ============================================================================

/**
 * Create a tool execution error
 */
export function toolExecutionError(
  toolName: string,
  message: string,
  cause?: Error
): ExecutionError {
  return new ExecutionError({
    code: ErrorCode.TOOL_EXECUTION_FAILED,
    message: `Tool "${toolName}" failed: ${message}`,
    context: { toolName },
    cause,
    recoveryHint: 'Check the tool configuration and try again.',
  });
}

/**
 * Create a policy violation error
 */
export function policyViolationError(
  policy: string,
  details: string
): ExecutionError {
  return new ExecutionError({
    code: ErrorCode.POLICY_VIOLATION,
    message: `Policy violation: ${details}`,
    context: { policy },
    recoveryHint: 'Contact workspace admin to adjust policies.',
  });
}

/**
 * Create an approval timeout error
 */
export function approvalTimeoutError(
  toolName: string,
  timeoutMs: number
): ExecutionError {
  return new ExecutionError({
    code: ErrorCode.APPROVAL_TIMEOUT,
    message: `Approval request for "${toolName}" timed out after ${timeoutMs}ms`,
    context: { toolName, timeoutMs },
    recoveryHint: 'Check the Approvals page to manually approve pending requests.',
  });
}

/**
 * Create a rate limit error
 */
export function rateLimitedError(
  resource: string,
  retryAfterMs?: number
): ExecutionError {
  const hint = retryAfterMs
    ? `Wait ${Math.ceil(retryAfterMs / 1000)} seconds before retrying.`
    : 'Wait a moment before retrying.';

  return new ExecutionError({
    code: ErrorCode.RATE_LIMITED,
    message: `Rate limit exceeded for ${resource}`,
    context: { resource, retryAfterMs },
    recoveryHint: hint,
  });
}
