import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { OptimisticLockError } from '@baleyui/db';
import { sanitizeErrorMessage, isUserFacingError } from '@/lib/errors/sanitize';

// =============================================================================
// COMMON VALIDATION SCHEMAS (API-001)
// =============================================================================

/**
 * Standard pagination input schema with validated limits
 */
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().uuid().optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * Common name validation - non-empty, trimmed, max 255 chars
 */
export const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(255, 'Name must be 255 characters or less')
  .trim();

/**
 * Common description validation - trimmed, max 2000 chars
 */
export const descriptionSchema = z.string()
  .max(2000, 'Description must be 2000 characters or less')
  .trim()
  .optional();

/**
 * UUID validation with helpful error message
 */
export const uuidSchema = z.string().uuid('Invalid ID format');

/**
 * BAL code validation - non-empty, reasonable size limit
 */
export const balCodeSchema = z.string()
  .min(1, 'BAL code is required')
  .max(100000, 'BAL code exceeds maximum size');

/**
 * Version number for optimistic locking
 */
export const versionSchema = z.number().int().min(0);

/**
 * URL validation with protocol check
 */
export const urlSchema = z.string()
  .url('Invalid URL format')
  .max(2000, 'URL is too long')
  .optional();

// =============================================================================
// ERROR HANDLING HELPERS (API-002)
// =============================================================================

/**
 * Wrap a mutation with standard error handling
 * - Handles optimistic lock errors
 * - Sanitizes internal errors
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  resourceName: string = 'Resource'
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Handle optimistic lock errors
    if (error instanceof OptimisticLockError ||
        (error instanceof Error && error.message.includes('version'))) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `${resourceName} was modified by another user. Please refresh and try again.`,
      });
    }

    // Re-throw tRPC errors as-is
    if (error instanceof TRPCError) {
      throw error;
    }

    // Sanitize and wrap other errors
    const message = isUserFacingError(error)
      ? sanitizeErrorMessage(error)
      : 'An internal error occurred';

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message,
    });
  }
}

/**
 * Throw a NOT_FOUND error for a resource
 */
export function throwNotFound(resourceName: string = 'Resource'): never {
  throw new TRPCError({
    code: 'NOT_FOUND',
    message: `${resourceName} not found`,
  });
}

/**
 * Throw a BAD_REQUEST error with a message
 */
export function throwBadRequest(message: string): never {
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message,
  });
}

// =============================================================================
// OWNERSHIP VERIFICATION HELPERS
// =============================================================================

/**
 * Verify a resource belongs to the specified workspace.
 * Throws NOT_FOUND (not FORBIDDEN) to prevent information leakage.
 */
export function verifyOwnership<T extends { workspaceId: string | null }>(
  resource: T | null | undefined,
  workspaceId: string,
  resourceName: string = 'Resource'
): asserts resource is T & { workspaceId: string } {
  if (!resource) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${resourceName} not found`,
    });
  }

  if (resource.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: 'NOT_FOUND', // Use NOT_FOUND to not reveal existence
      message: `${resourceName} not found`,
    });
  }
}

/**
 * Verify a nested resource (via relation) belongs to the workspace.
 */
export function verifyNestedOwnership<T extends { workspaceId?: string | null }>(
  parent: T | null | undefined,
  workspaceId: string,
  resourceName: string = 'Resource'
): asserts parent is T {
  if (!parent) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${resourceName} not found`,
    });
  }

  if (parent.workspaceId && parent.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${resourceName} not found`,
    });
  }
}

/**
 * Helper to check if resource exists without throwing.
 */
export function exists<T>(resource: T | null | undefined): resource is T {
  return resource !== null && resource !== undefined;
}
