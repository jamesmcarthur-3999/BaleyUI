/**
 * Creator Error Handling
 *
 * Maps tRPC error codes to user-friendly messages for the BaleyBot creator.
 */

import { TRPCClientError } from '@trpc/client';

/**
 * Error categories for the creator
 */
export type CreatorErrorCategory =
  | 'network'
  | 'conflict'
  | 'not_found'
  | 'validation'
  | 'permission'
  | 'server'
  | 'unknown';

/**
 * Structured error for display in the creator
 */
export interface CreatorError {
  category: CreatorErrorCategory;
  title: string;
  message: string;
  action?: string;
  retryable: boolean;
}

/**
 * Map of tRPC error codes to user-friendly messages
 */
const errorMessages: Record<string, CreatorError> = {
  // Conflict errors (optimistic locking)
  CONFLICT: {
    category: 'conflict',
    title: 'Save Conflict',
    message: 'This BaleyBot was modified elsewhere. Your changes may overwrite those updates.',
    action: 'Reload to see the latest version, or save anyway to keep your changes.',
    retryable: true,
  },

  // Not found errors
  NOT_FOUND: {
    category: 'not_found',
    title: 'Not Found',
    message: 'This BaleyBot no longer exists or has been deleted.',
    action: 'Return to the BaleyBots list to create a new one.',
    retryable: false,
  },

  // Validation errors
  BAD_REQUEST: {
    category: 'validation',
    title: 'Invalid Input',
    message: 'Some of the information provided is invalid.',
    action: 'Check your inputs and try again.',
    retryable: true,
  },

  PARSE_ERROR: {
    category: 'validation',
    title: 'Invalid Data',
    message: 'The data format is incorrect.',
    action: 'Please try again.',
    retryable: true,
  },

  // Permission errors
  UNAUTHORIZED: {
    category: 'permission',
    title: 'Not Signed In',
    message: 'You need to sign in to perform this action.',
    action: 'Sign in and try again.',
    retryable: false,
  },

  FORBIDDEN: {
    category: 'permission',
    title: 'Access Denied',
    message: "You don't have permission to access this BaleyBot.",
    action: 'Contact the workspace owner if you need access.',
    retryable: false,
  },

  // Server errors
  INTERNAL_SERVER_ERROR: {
    category: 'server',
    title: 'Server Error',
    message: 'Something went wrong on our end.',
    action: 'Please try again in a moment.',
    retryable: true,
  },

  TIMEOUT: {
    category: 'server',
    title: 'Request Timeout',
    message: 'The server took too long to respond.',
    action: 'Please try again.',
    retryable: true,
  },

  // Precondition failures
  PRECONDITION_FAILED: {
    category: 'validation',
    title: 'Cannot Proceed',
    message: 'The action cannot be completed in the current state.',
    action: 'Check the BaleyBot status and try again.',
    retryable: true,
  },

  // Rate limiting
  TOO_MANY_REQUESTS: {
    category: 'server',
    title: 'Too Many Requests',
    message: "You're making requests too quickly.",
    action: 'Please wait a moment before trying again.',
    retryable: true,
  },
};

/**
 * Network error detection patterns
 */
const networkErrorPatterns = [
  'fetch failed',
  'network error',
  'failed to fetch',
  'net::',
  'networkerror',
  'econnrefused',
  'enotfound',
  'etimedout',
];

/**
 * Check if an error is a network error
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return networkErrorPatterns.some((pattern) => message.includes(pattern));
  }
  return false;
}

/**
 * Parse a tRPC error into a user-friendly CreatorError
 */
export function parseCreatorError(error: unknown): CreatorError {
  // Handle network errors first
  if (isNetworkError(error)) {
    return {
      category: 'network',
      title: 'Connection Error',
      message: 'Unable to connect to the server. Check your internet connection.',
      action: 'Make sure you are online and try again.',
      retryable: true,
    };
  }

  // Handle tRPC errors
  if (error instanceof TRPCClientError) {
    const code = error.data?.code as string;
    const mapped = errorMessages[code];

    if (mapped) {
      // Use custom message from server if available
      const serverMessage = error.message;
      if (serverMessage && serverMessage !== code && !serverMessage.includes('TRPCClientError')) {
        return {
          ...mapped,
          message: serverMessage,
        };
      }
      return mapped;
    }
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    // Check for specific error messages
    if (error.message.includes('version') || error.message.includes('modified')) {
      return errorMessages.CONFLICT!;
    }

    return {
      category: 'unknown',
      title: 'Error',
      message: error.message || 'An unexpected error occurred.',
      action: 'Please try again.',
      retryable: true,
    };
  }

  // Fallback for unknown errors
  return {
    category: 'unknown',
    title: 'Error',
    message: 'An unexpected error occurred.',
    action: 'Please try again.',
    retryable: true,
  };
}

/**
 * Format an error for display in a toast or message
 */
export function formatErrorMessage(error: unknown): string {
  const parsed = parseCreatorError(error);
  return `${parsed.title}: ${parsed.message}`;
}

/**
 * Format an error with action hint
 */
export function formatErrorWithAction(error: unknown): string {
  const parsed = parseCreatorError(error);
  if (parsed.action) {
    return `${parsed.message} ${parsed.action}`;
  }
  return parsed.message;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return parseCreatorError(error).retryable;
}
