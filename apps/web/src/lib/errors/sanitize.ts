/**
 * Sanitize error messages before sending to client.
 * Removes internal details while preserving actionable information.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Remove stack traces
    const sanitized = message.split('\n')[0] ?? message;

    // Remove file paths
    const noPath = sanitized.replace(/\/[^\s]+\.(ts|js|tsx|jsx)/g, '[internal]');

    // Remove API keys patterns
    const noKeys = noPath.replace(/sk-[a-zA-Z0-9]+/g, '[redacted]');

    // Limit length
    return noKeys.slice(0, 200);
  }

  return 'An unexpected error occurred';
}

/**
 * Check if an error is safe to expose to clients
 */
export function isUserFacingError(error: unknown): boolean {
  if (error instanceof Error) {
    // Known safe error patterns
    const safePatterns = [
      /timeout/i,
      /cancelled/i,
      /not found/i,
      /invalid input/i,
      /rate limit/i,
    ];
    return safePatterns.some(p => p.test(error.message));
  }
  return false;
}

// ============================================================================
// Error Context Preservation (ERR-003)
// ============================================================================

/**
 * Context information attached to wrapped errors
 */
export interface ErrorContext {
  /** Layer where the error originated (e.g., 'executor', 'router', 'webhook') */
  layer: string;
  /** Operation being performed when the error occurred */
  operation?: string;
  /** Entity ID (e.g., baleybotId, flowId) */
  entityId?: string;
  /** Entity type (e.g., 'baleybot', 'flow', 'execution') */
  entityType?: string;
  /** Execution ID if applicable */
  executionId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp when the error was wrapped */
  timestamp: number;
}

/**
 * Extended error class that preserves context through layers
 */
export class ContextualError extends Error {
  /** Original error that was wrapped */
  public readonly cause: Error | undefined;
  /** Context chain from all layers */
  public readonly contexts: ErrorContext[];
  /** Unique error ID for tracking */
  public readonly errorId: string;

  constructor(
    message: string,
    context: Omit<ErrorContext, 'timestamp'>,
    cause?: unknown
  ) {
    super(message);
    this.name = 'ContextualError';
    this.errorId = crypto.randomUUID();
    this.contexts = [];

    // Preserve the original error and its stack
    if (cause instanceof ContextualError) {
      // If wrapping another ContextualError, merge contexts
      this.cause = cause.cause;
      this.contexts = [...cause.contexts];
      // Preserve original stack trace
      if (cause.stack) {
        this.stack = `${this.stack}\n\nCaused by: ${cause.stack}`;
      }
    } else if (cause instanceof Error) {
      this.cause = cause;
      // Preserve original stack trace
      if (cause.stack) {
        this.stack = `${this.stack}\n\nCaused by: ${cause.stack}`;
      }
    }

    // Add new context
    this.contexts.push({
      ...context,
      timestamp: Date.now(),
    });
  }

  /**
   * Get a formatted string of all context layers
   */
  getContextChain(): string {
    return this.contexts
      .map((ctx, i) => {
        const parts = [`[${i + 1}] ${ctx.layer}`];
        if (ctx.operation) parts.push(`op=${ctx.operation}`);
        if (ctx.entityType && ctx.entityId) parts.push(`${ctx.entityType}=${ctx.entityId}`);
        if (ctx.executionId) parts.push(`exec=${ctx.executionId}`);
        return parts.join(' ');
      })
      .join(' -> ');
  }

  /**
   * Get the original error message (from the root cause)
   */
  getOriginalMessage(): string {
    return this.cause?.message ?? this.message;
  }

  /**
   * Convert to a plain object for logging
   */
  toLogObject(): Record<string, unknown> {
    return {
      errorId: this.errorId,
      message: this.message,
      originalMessage: this.getOriginalMessage(),
      contextChain: this.getContextChain(),
      contexts: this.contexts,
      stack: this.stack,
    };
  }
}

/**
 * Wrap an error with additional context.
 * If the error is already a ContextualError, adds a new context layer.
 *
 * @example
 * ```ts
 * try {
 *   await executeBaleybot(balCode, input, ctx);
 * } catch (error) {
 *   throw wrapError(error, {
 *     layer: 'router',
 *     operation: 'execute',
 *     entityType: 'baleybot',
 *     entityId: input.id,
 *   });
 * }
 * ```
 */
export function wrapError(
  error: unknown,
  context: Omit<ErrorContext, 'timestamp'>
): ContextualError {
  const message = error instanceof Error
    ? error.message
    : String(error);

  return new ContextualError(
    `[${context.layer}] ${message}`,
    context,
    error
  );
}

/**
 * Extract error context if available
 */
export function getErrorContext(error: unknown): ErrorContext[] {
  if (error instanceof ContextualError) {
    return error.contexts;
  }
  return [];
}

/**
 * Check if an error is a ContextualError
 */
export function isContextualError(error: unknown): error is ContextualError {
  return error instanceof ContextualError;
}
