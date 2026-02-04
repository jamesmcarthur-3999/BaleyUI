import { TRPCError } from '@trpc/server';

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
