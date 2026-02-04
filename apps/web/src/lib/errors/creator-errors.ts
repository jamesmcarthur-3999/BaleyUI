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
 * Parser error location information
 */
export interface ParserErrorLocation {
  line: number;
  column: number;
  /** The source line where the error occurred */
  sourceLine?: string;
}

/**
 * Structured error for display in the creator
 */
export interface CreatorError {
  category: CreatorErrorCategory;
  title: string;
  message: string;
  action?: string;
  retryable: boolean;
  /** For parser errors, the location in the source code */
  parserLocation?: ParserErrorLocation;
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
 * Parse BAL error location from error message
 * BAL errors have format: "message at line X, column Y\n\n  source line\n  ^"
 */
function parseBALErrorLocation(message: string): ParserErrorLocation | undefined {
  // Match "at line X, column Y" pattern
  const locationMatch = message.match(/at line (\d+), column (\d+)/);
  if (!locationMatch || !locationMatch[1] || !locationMatch[2]) return undefined;

  const line = parseInt(locationMatch[1], 10);
  const column = parseInt(locationMatch[2], 10);

  // Try to extract the source line (appears after two newlines)
  const parts = message.split('\n\n');
  let sourceLine: string | undefined;
  const secondPart = parts[1];
  if (secondPart) {
    const lines = secondPart.split('\n');
    const firstLine = lines[0];
    if (firstLine) {
      // Source line is indented with 2 spaces
      sourceLine = firstLine.replace(/^  /, '');
    }
  }

  return { line, column, sourceLine };
}

/**
 * Check if an error is a BAL parser/lexer error
 */
function isBALError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'LexerError' ||
      error.name === 'ParserError' ||
      error.name === 'InterpreterError' ||
      error.name === 'BALError' ||
      error.message.includes('at line') && error.message.includes('column')
    );
  }
  return false;
}

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

  // Handle BAL parser/lexer errors
  if (isBALError(error) && error instanceof Error) {
    const parserLocation = parseBALErrorLocation(error.message);
    // Extract the core message (before "at line...")
    const coreMessage = error.message.split(' at line ')[0] || error.message;

    return {
      category: 'validation',
      title: error.name === 'LexerError' ? 'Syntax Error' : 'Parse Error',
      message: coreMessage,
      action: parserLocation
        ? `Check line ${parserLocation.line}, column ${parserLocation.column}.`
        : 'Check your BAL code syntax.',
      retryable: true,
      parserLocation,
    };
  }

  // Handle tRPC errors
  if (error instanceof TRPCClientError) {
    const code = error.data?.code as string;
    const mapped = errorMessages[code];

    // Check if the tRPC error wraps a BAL error
    if (error.message && (error.message.includes('at line') && error.message.includes('column'))) {
      const parserLocation = parseBALErrorLocation(error.message);
      const coreMessage = error.message.split(' at line ')[0] || error.message;

      return {
        category: 'validation',
        title: 'Parse Error',
        message: coreMessage,
        action: parserLocation
          ? `Check line ${parserLocation.line}, column ${parserLocation.column}.`
          : 'Check your BAL code syntax.',
        retryable: true,
        parserLocation,
      };
    }

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

/**
 * Format a parser error with source location for display
 */
export function formatParserError(error: CreatorError): string {
  const parts = [error.message];

  if (error.parserLocation) {
    const loc = error.parserLocation;
    if (loc.sourceLine) {
      parts.push('');
      parts.push(`  ${loc.sourceLine}`);
      parts.push(`  ${' '.repeat(Math.max(0, loc.column - 1))}^`);
    }
    parts.push('');
    parts.push(`Line ${loc.line}, column ${loc.column}`);
  }

  return parts.join('\n');
}

/**
 * Check if a CreatorError is a parser error with location info
 */
export function isParserError(error: CreatorError): boolean {
  return error.parserLocation !== undefined;
}
