/**
 * Self-Healing Error Handler Service
 *
 * Provides automatic error recovery strategies:
 * - Transient errors: auto-retry with exponential backoff
 * - Data errors: log, skip, continue
 * - Tool failures: pause, diagnose, notify with suggested actions
 * - AI errors: retry with fallback model
 */

// TODO: STYLE-002 - This file is over 600 lines (~607 lines). Consider splitting into:
// - self-healing/types.ts (type definitions)
// - self-healing/handlers.ts (error handler implementations)
// - self-healing/service.ts (main service)

import type { ExecutorContext } from '../executor';
import { createLogger } from '@/lib/logger';

const log = createLogger('self-healing');

// ============================================================================
// TYPES
// ============================================================================

export type ErrorResolutionAction =
  | 'retry'
  | 'retry_with_backoff'
  | 'skip'
  | 'fallback'
  | 'pause'
  | 'fail';

export interface ErrorResolution {
  action: ErrorResolutionAction;
  message: string;
  /** Delay in ms before retry (if action is retry) */
  delayMs?: number;
  /** Modified context for retry (e.g., different model) */
  modifiedContext?: Partial<ExecutorContext>;
  /** Suggested actions for user */
  suggestedActions?: string[];
  /** Whether to notify the user */
  shouldNotify?: boolean;
}

export interface ErrorHandler {
  /** Name of the handler for logging */
  name: string;
  /** Check if this handler can handle the error */
  canHandle(error: Error, context: ErrorHandlerContext): boolean;
  /** Handle the error and return resolution */
  handle(error: Error, context: ErrorHandlerContext): Promise<ErrorResolution>;
}

export interface ErrorHandlerContext {
  executorContext: ExecutorContext;
  attemptNumber: number;
  maxAttempts: number;
  entityName?: string;
  toolName?: string;
  elapsedMs?: number;
}

export interface SelfHealingConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay for backoff (ms) */
  maxDelayMs: number;
  /** Fallback models in order of preference */
  fallbackModels: string[];
  /** Whether to notify on tool failures */
  notifyOnToolFailure: boolean;
}

const DEFAULT_CONFIG: SelfHealingConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  fallbackModels: [
    'openai:gpt-4o-mini',
    'anthropic:claude-3-5-haiku-20241022',
  ],
  notifyOnToolFailure: true,
};

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify error type for appropriate handling
 */
export function classifyError(error: Error): {
  category: 'transient' | 'data' | 'tool' | 'ai' | 'unknown';
  isRetryable: boolean;
} {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Transient errors (network, rate limits, timeouts)
  if (
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504')
  ) {
    return { category: 'transient', isRetryable: true };
  }

  // AI/Model errors
  if (
    message.includes('model') ||
    message.includes('context length') ||
    message.includes('token') ||
    message.includes('overloaded') ||
    message.includes('capacity') ||
    name.includes('openai') ||
    name.includes('anthropic')
  ) {
    return { category: 'ai', isRetryable: true };
  }

  // Tool errors
  if (
    message.includes('tool') ||
    message.includes('function') ||
    message.includes('execution failed')
  ) {
    return { category: 'tool', isRetryable: false };
  }

  // Data errors (validation, parsing)
  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('parse') ||
    message.includes('json') ||
    message.includes('schema')
  ) {
    return { category: 'data', isRetryable: false };
  }

  return { category: 'unknown', isRetryable: false };
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

/**
 * Handler for transient errors (network, rate limits)
 */
const transientErrorHandler: ErrorHandler = {
  name: 'TransientErrorHandler',

  canHandle(error: Error): boolean {
    const { category } = classifyError(error);
    return category === 'transient';
  },

  async handle(error: Error, context: ErrorHandlerContext): Promise<ErrorResolution> {
    const { attemptNumber, maxAttempts } = context;

    if (attemptNumber >= maxAttempts) {
      return {
        action: 'fail',
        message: `Transient error persisted after ${maxAttempts} attempts: ${error.message}`,
        shouldNotify: true,
        suggestedActions: [
          'Check network connectivity',
          'Verify API endpoint is accessible',
          'Check for service outages',
        ],
      };
    }

    // Exponential backoff
    const delayMs = Math.min(
      DEFAULT_CONFIG.baseDelayMs * Math.pow(2, attemptNumber - 1),
      DEFAULT_CONFIG.maxDelayMs
    );

    return {
      action: 'retry_with_backoff',
      message: `Transient error detected, retrying in ${delayMs}ms (attempt ${attemptNumber}/${maxAttempts})`,
      delayMs,
    };
  },
};

/**
 * Handler for data/validation errors
 */
const dataErrorHandler: ErrorHandler = {
  name: 'DataErrorHandler',

  canHandle(error: Error): boolean {
    const { category } = classifyError(error);
    return category === 'data';
  },

  async handle(error: Error, _context: ErrorHandlerContext): Promise<ErrorResolution> {
    // Data errors are usually not retryable - bad input stays bad
    return {
      action: 'skip',
      message: `Data validation error: ${error.message}`,
      shouldNotify: false,
      suggestedActions: [
        'Check input data format',
        'Verify JSON structure',
        'Review validation rules',
      ],
    };
  },
};

/**
 * Handler for tool execution failures
 */
const toolFailureHandler: ErrorHandler = {
  name: 'ToolFailureHandler',

  canHandle(error: Error): boolean {
    const { category } = classifyError(error);
    return category === 'tool';
  },

  async handle(error: Error, context: ErrorHandlerContext): Promise<ErrorResolution> {
    const { toolName } = context;

    // Analyze the tool error
    const diagnosis = diagnoseToolFailure(error, toolName);

    return {
      action: 'pause',
      message: `Tool "${toolName || 'unknown'}" failed: ${error.message}`,
      shouldNotify: DEFAULT_CONFIG.notifyOnToolFailure,
      suggestedActions: diagnosis.suggestedActions,
    };
  },
};

/**
 * Handler for AI/model errors
 */
const aiErrorHandler: ErrorHandler = {
  name: 'AIErrorHandler',

  canHandle(error: Error): boolean {
    const { category } = classifyError(error);
    return category === 'ai';
  },

  async handle(error: Error, context: ErrorHandlerContext): Promise<ErrorResolution> {
    const { attemptNumber, maxAttempts } = context;
    const message = error.message.toLowerCase();

    // Context length exceeded - need fallback with smaller context
    if (message.includes('context length') || message.includes('token')) {
      return {
        action: 'fallback',
        message: 'Context length exceeded, attempting with reduced context',
        modifiedContext: {
          // Signal to executor to reduce context
        },
        suggestedActions: [
          'Reduce input size',
          'Use a model with larger context window',
          'Split the task into smaller parts',
        ],
      };
    }

    // Model overloaded - try fallback model
    if (
      message.includes('overloaded') ||
      message.includes('capacity') ||
      message.includes('unavailable')
    ) {
      const fallbackModel = getFallbackModel(attemptNumber);

      if (fallbackModel) {
        return {
          action: 'fallback',
          message: `Primary model unavailable, falling back to ${fallbackModel}`,
          modifiedContext: {
            // The executor would use this to set a different model
          },
        };
      }
    }

    // Rate limit - retry with backoff
    if (message.includes('rate limit') || message.includes('429')) {
      if (attemptNumber >= maxAttempts) {
        return {
          action: 'fail',
          message: `Rate limit persisted after ${maxAttempts} attempts`,
          shouldNotify: true,
          suggestedActions: [
            'Reduce request frequency',
            'Implement request batching',
            'Upgrade API plan',
          ],
        };
      }

      const delayMs = Math.min(
        DEFAULT_CONFIG.baseDelayMs * Math.pow(2, attemptNumber),
        DEFAULT_CONFIG.maxDelayMs
      );

      return {
        action: 'retry_with_backoff',
        message: `Rate limited, retrying in ${delayMs}ms`,
        delayMs,
      };
    }

    // Generic AI error
    if (attemptNumber < maxAttempts) {
      return {
        action: 'retry',
        message: `AI error, retrying (attempt ${attemptNumber}/${maxAttempts})`,
        delayMs: 1000,
      };
    }

    return {
      action: 'fail',
      message: `AI error after ${maxAttempts} attempts: ${error.message}`,
      shouldNotify: true,
      suggestedActions: [
        'Check API key validity',
        'Verify model availability',
        'Review error logs for details',
      ],
    };
  },
};

/**
 * Default handler for unknown errors
 */
const unknownErrorHandler: ErrorHandler = {
  name: 'UnknownErrorHandler',

  canHandle(): boolean {
    return true; // Catch-all
  },

  async handle(error: Error, context: ErrorHandlerContext): Promise<ErrorResolution> {
    const { attemptNumber, maxAttempts } = context;

    // Give unknown errors one retry
    if (attemptNumber < Math.min(2, maxAttempts)) {
      return {
        action: 'retry',
        message: `Unknown error, attempting retry: ${error.message}`,
        delayMs: 1000,
      };
    }

    return {
      action: 'fail',
      message: `Unhandled error: ${error.message}`,
      shouldNotify: true,
      suggestedActions: [
        'Check error logs for stack trace',
        'Review recent code changes',
        'Contact support if issue persists',
      ],
    };
  },
};

// ============================================================================
// HANDLER REGISTRY
// ============================================================================

const errorHandlers: ErrorHandler[] = [
  transientErrorHandler,
  dataErrorHandler,
  toolFailureHandler,
  aiErrorHandler,
  unknownErrorHandler, // Must be last
];

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Handle an error and determine resolution
 */
export async function handleError(
  error: Error,
  context: ErrorHandlerContext
): Promise<ErrorResolution> {
  // Find appropriate handler
  for (const handler of errorHandlers) {
    if (handler.canHandle(error, context)) {
      log.debug(`Using ${handler.name} for error`, { error: error.message });
      const resolution = await handler.handle(error, context);
      log.debug(`Resolution: ${resolution.action}`, { message: resolution.message });
      return resolution;
    }
  }

  // Should never reach here due to unknownErrorHandler
  return {
    action: 'fail',
    message: `No handler found for error: ${error.message}`,
  };
}

/**
 * Execute with self-healing error handling
 */
export async function executeWithHealing<T>(
  operation: () => Promise<T>,
  context: Omit<ErrorHandlerContext, 'attemptNumber'>,
  config: Partial<SelfHealingConfig> = {}
): Promise<{ result: T; attempts: number } | { error: Error; resolution: ErrorResolution }> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let attemptNumber = 1;

  while (attemptNumber <= mergedConfig.maxRetries) {
    try {
      const result = await operation();
      return { result, attempts: attemptNumber };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      const resolution = await handleError(err, {
        ...context,
        attemptNumber,
        maxAttempts: mergedConfig.maxRetries,
      });

      switch (resolution.action) {
        case 'retry':
        case 'retry_with_backoff':
          if (resolution.delayMs) {
            await sleep(resolution.delayMs);
          }
          attemptNumber++;
          continue;

        case 'skip':
          // Return a special skip result
          return { error: err, resolution };

        case 'fallback':
          // For fallback, we'd modify the operation context
          // This is a simplified version - real implementation would
          // pass modified context to operation
          attemptNumber++;
          continue;

        case 'pause':
        case 'fail':
        default:
          return { error: err, resolution };
      }
    }
  }

  // Exhausted retries
  return {
    error: new Error(`Operation failed after ${mergedConfig.maxRetries} attempts`),
    resolution: {
      action: 'fail',
      message: `Maximum retries (${mergedConfig.maxRetries}) exceeded`,
    },
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get fallback model for the given attempt
 */
function getFallbackModel(attemptNumber: number): string | null {
  const fallbacks = DEFAULT_CONFIG.fallbackModels;
  const index = attemptNumber - 1;
  return index < fallbacks.length ? fallbacks[index]! : null;
}

/**
 * Diagnose a tool failure
 */
function diagnoseToolFailure(
  error: Error,
  toolName?: string
): { diagnosis: string; suggestedActions: string[] } {
  const message = error.message.toLowerCase();

  if (message.includes('permission') || message.includes('forbidden')) {
    return {
      diagnosis: 'Permission denied',
      suggestedActions: [
        'Check tool permissions in workspace policies',
        'Verify API credentials have required scopes',
        'Request elevated permissions if needed',
      ],
    };
  }

  if (message.includes('not found') || message.includes('404')) {
    return {
      diagnosis: 'Resource not found',
      suggestedActions: [
        'Verify the target resource exists',
        'Check for typos in resource identifiers',
        'Ensure the resource hasn\'t been deleted',
      ],
    };
  }

  if (message.includes('timeout')) {
    return {
      diagnosis: 'Operation timed out',
      suggestedActions: [
        'Increase timeout for long-running operations',
        'Check target service availability',
        'Consider breaking into smaller operations',
      ],
    };
  }

  if (message.includes('invalid') || message.includes('validation')) {
    return {
      diagnosis: 'Invalid input to tool',
      suggestedActions: [
        'Review tool input requirements',
        'Check input data types and formats',
        'Validate data before passing to tool',
      ],
    };
  }

  return {
    diagnosis: `Tool ${toolName || 'unknown'} encountered an error`,
    suggestedActions: [
      'Check tool documentation',
      'Review error message for details',
      'Try with simplified inputs',
    ],
  };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Track self-healing statistics
 */
export interface HealingStats {
  totalErrors: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  byCategory: Record<string, number>;
  avgAttemptsToRecover: number;
}

const healingStats: HealingStats = {
  totalErrors: 0,
  successfulRecoveries: 0,
  failedRecoveries: 0,
  byCategory: {},
  avgAttemptsToRecover: 0,
};

/**
 * Get current healing statistics
 */
export function getHealingStats(): HealingStats {
  return { ...healingStats };
}

/**
 * Record a healing attempt
 */
export function recordHealingAttempt(
  category: string,
  successful: boolean,
  attempts: number
): void {
  healingStats.totalErrors++;
  healingStats.byCategory[category] = (healingStats.byCategory[category] || 0) + 1;

  if (successful) {
    healingStats.successfulRecoveries++;
    // Update rolling average
    const total = healingStats.successfulRecoveries;
    healingStats.avgAttemptsToRecover =
      (healingStats.avgAttemptsToRecover * (total - 1) + attempts) / total;
  } else {
    healingStats.failedRecoveries++;
  }
}
