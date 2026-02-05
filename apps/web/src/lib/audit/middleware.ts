import { db, auditLogs } from '@baleyui/db';
import type { AuditAction } from '@baleyui/db';
import type { Context } from '../trpc/trpc';
import { createLogger } from '@/lib/logger';

const logger = createLogger('audit/middleware');

/**
 * Audit log entry data to be logged
 */
export interface AuditLogData {
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
}

/**
 * Extended context with audit logging capability.
 * Uses type intersection instead of interface extension because Context
 * is a union type (Awaited<ReturnType<...>>) which cannot be extended.
 */
export type AuditContext = Context & {
  /**
   * Log an audit event for the current request.
   * Captures what changed, who changed it, and contextual metadata.
   *
   * @param data - The audit log data
   *
   * @example
   * ```ts
   * // In a tRPC procedure
   * await ctx.audit({
   *   entityType: 'block',
   *   entityId: block.id,
   *   action: 'update',
   *   changes: { name: 'New Name' },
   *   previousValues: { name: 'Old Name' },
   * });
   * ```
   */
  audit: (data: AuditLogData) => Promise<void>;

  /**
   * Request metadata for audit logging
   */
  auditMeta: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  };
};

/**
 * tRPC middleware that adds audit logging capability to the context.
 * Enriches context with request metadata (IP, user agent, request ID) and
 * provides an audit() helper function for logging operations.
 *
 * @example
 * ```ts
 * // In your tRPC setup
 * import { auditMiddleware } from '@/lib/audit/middleware';
 *
 * export const auditedProcedure = protectedProcedure.use(auditMiddleware);
 *
 * // Then in your router
 * export const blocksRouter = router({
 *   update: auditedProcedure
 *     .input(z.object({ id: z.string(), name: z.string() }))
 *     .mutation(async ({ ctx, input }) => {
 *       const current = await ctx.db.query.blocks.findFirst({
 *         where: eq(blocks.id, input.id),
 *       });
 *
 *       const updated = await ctx.db
 *         .update(blocks)
 *         .set({ name: input.name })
 *         .where(eq(blocks.id, input.id))
 *         .returning();
 *
 *       // Log the change
 *       await ctx.audit({
 *         entityType: 'block',
 *         entityId: input.id,
 *         action: 'update',
 *         changes: { name: input.name },
 *         previousValues: { name: current?.name },
 *       });
 *
 *       return updated[0];
 *     }),
 * });
 * ```
 */
export const auditMiddleware = async <T>({
  ctx,
  next,
}: {
  ctx: Context;
  next: (opts?: { ctx: AuditContext }) => T;
  path: string;
  type: string;
}) => {
  // Extract request metadata from headers if available
  // Note: In Next.js App Router, headers are available via next/headers
  const auditMeta: AuditContext['auditMeta'] = {
    requestId: crypto.randomUUID(), // Generate a unique request ID
  };

  // Try to get headers from the request context if available
  // This will work in Next.js API routes
  if (typeof globalThis !== 'undefined' && 'headers' in globalThis) {
    try {
      const { headers } = await import('next/headers');
      const headersList = await headers();

      auditMeta.ipAddress =
        headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headersList.get('x-real-ip') ||
        undefined;

      auditMeta.userAgent = headersList.get('user-agent') || undefined;
    } catch {
      // Headers not available in this context (e.g., server components)
      // That's fine, continue without them
    }
  }

  // Add audit helper to context
  const audit = async (data: AuditLogData): Promise<void> => {
    try {
      await db.insert(auditLogs).values({
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        changes: data.changes || null,
        previousValues: data.previousValues || null,
        userId: ctx.userId || null,
        workspaceId:
          'workspace' in ctx && ctx.workspace
            ? (ctx.workspace as { id: string }).id
            : null,
        ipAddress: auditMeta.ipAddress || null,
        userAgent: auditMeta.userAgent || null,
        requestId: auditMeta.requestId || null,
      });
    } catch (error) {
      // Log the error but don't fail the request
      logger.error('Failed to write audit log', error);
      // In production, you might want to send this to a monitoring service
    }
  };

  // Continue with enriched context
  return next({
    ctx: {
      ...ctx,
      audit,
      auditMeta,
    } as AuditContext,
  });
};

/**
 * Helper function to compute changes between old and new objects.
 * Only includes fields that actually changed.
 *
 * @param previous - Previous object state
 * @param current - Current object state
 * @returns Object containing only changed fields
 *
 * @example
 * ```ts
 * const changes = getChanges(
 *   { name: 'Old', status: 'active' },
 *   { name: 'New', status: 'active' }
 * );
 * // Returns: { name: 'New' }
 * ```
 */
export function getChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  for (const key in current) {
    if (current[key] !== previous[key]) {
      changes[key] = current[key];
    }
  }

  return changes;
}

/**
 * Helper function to extract previous values for changed fields.
 *
 * @param previous - Previous object state
 * @param changedKeys - Array of keys that changed
 * @returns Object containing previous values for changed fields
 *
 * @example
 * ```ts
 * const previousValues = getPreviousValues(
 *   { name: 'Old', status: 'active', count: 5 },
 *   ['name', 'count']
 * );
 * // Returns: { name: 'Old', count: 5 }
 * ```
 */
export function getPreviousValues(
  previous: Record<string, unknown>,
  changedKeys: string[]
): Record<string, unknown> {
  const previousValues: Record<string, unknown> = {};

  for (const key of changedKeys) {
    if (key in previous) {
      previousValues[key] = previous[key];
    }
  }

  return previousValues;
}
