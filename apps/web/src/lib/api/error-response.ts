/**
 * Standardized API Error Response Helper
 *
 * Provides consistent error response formatting across all API routes.
 * In production, internal error details are sanitized to prevent information leakage.
 */

import { NextResponse } from 'next/server';
import { sanitizeErrorMessage } from '@/lib/errors/sanitize';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api-error');

export interface ApiErrorResponse {
  error: string;
  code?: string;
  requestId?: string;
}

/**
 * Create a standardized error response for API routes.
 *
 * In production, only safe error messages are returned.
 * In development, full error details are included.
 *
 * @example
 * ```ts
 * catch (error) {
 *   logger.error('Failed to process request', error);
 *   return createErrorResponse(500, error, { code: 'EXECUTION_FAILED' });
 * }
 * ```
 */
export function createErrorResponse(
  status: number,
  error: unknown,
  options?: {
    code?: string;
    requestId?: string;
    /** Override the error message (used for known safe messages) */
    message?: string;
  }
): NextResponse<ApiErrorResponse> {
  const isDev = process.env.NODE_ENV === 'development';

  const errorMessage = options?.message
    ?? (isDev
      ? (error instanceof Error ? error.message : String(error))
      : sanitizeErrorMessage(error));

  const body: ApiErrorResponse = {
    error: errorMessage,
  };

  if (options?.code) body.code = options.code;
  if (options?.requestId) body.requestId = options.requestId;

  return NextResponse.json(body, { status });
}

/**
 * Shorthand for common HTTP error responses with safe messages.
 */
export const apiErrors = {
  unauthorized: (message = 'Unauthorized') =>
    createErrorResponse(401, null, { message }),

  forbidden: (message = 'Access denied') =>
    createErrorResponse(403, null, { message }),

  notFound: (entity = 'Resource') =>
    createErrorResponse(404, null, { message: `${entity} not found` }),

  badRequest: (message: string) =>
    createErrorResponse(400, null, { message }),

  internal: (error: unknown, options?: { code?: string; requestId?: string }) => {
    logger.error('Internal server error', error);
    return createErrorResponse(500, error, options);
  },
} as const;
