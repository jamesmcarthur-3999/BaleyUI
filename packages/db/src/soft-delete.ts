import { isNull, and, eq, sql } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { db } from './index';
import type { Transaction } from './transactions';

/**
 * Filter helper for excluding soft-deleted records from queries.
 * Use this in your where clauses to only return active (non-deleted) records.
 *
 * @param table - The Drizzle table with deletedAt column
 * @returns SQL condition that checks deletedAt is null
 *
 * @example
 * ```ts
 * const activeBlocks = await db.query.blocks.findMany({
 *   where: notDeleted(blocks),
 * });
 *
 * // Combine with other conditions
 * const activeUserBlocks = await db.query.blocks.findMany({
 *   where: (blocks, { eq, and }) =>
 *     and(
 *       notDeleted(blocks),
 *       eq(blocks.workspaceId, workspaceId)
 *     ),
 * });
 * ```
 */
export function notDeleted<
  T extends {
    deletedAt: PgColumn;
  }
>(table: T) {
  return isNull(table.deletedAt);
}

/**
 * Soft delete a record by setting deletedAt timestamp and deletedBy user ID.
 * The record remains in the database but is filtered out by queries using notDeleted().
 *
 * @param table - The Drizzle table to update
 * @param id - The record ID to soft delete
 * @param userId - The ID of the user performing the deletion
 * @param tx - Optional transaction to use
 * @returns The soft-deleted record
 *
 * @example
 * ```ts
 * const deleted = await softDelete(blocks, blockId, userId);
 * console.log('Deleted at:', deleted.deletedAt);
 * console.log('Deleted by:', deleted.deletedBy);
 * ```
 */
export async function softDelete<
  T extends PgTable & {
    id: any;
    deletedAt: any;
    deletedBy: any;
    updatedAt: any;
  }
>(
  table: T,
  id: string,
  userId: string,
  tx?: Transaction
): Promise<any> {
  const executor = tx || db;

  const result = await executor
    .update(table)
    .set({
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date(),
    } as any)
    .where(
      and(
        eq(table.id, id),
        isNull(table.deletedAt)
      ) as any
    )
    .returning();

  if (result.length === 0) {
    const tableName = (table as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')] || 'unknown';
    throw new Error(`Record not found or already deleted: ${tableName} ${id}`);
  }

  return result[0];
}

/**
 * Restore a soft-deleted record by clearing deletedAt and deletedBy fields.
 * Only works on records that have been soft-deleted.
 *
 * @param table - The Drizzle table to update
 * @param id - The record ID to restore
 * @param userId - The ID of the user performing the restoration (currently unused but included for audit trail)
 * @param tx - Optional transaction to use
 * @returns The restored record
 *
 * @example
 * ```ts
 * const restored = await restore(blocks, blockId, userId);
 * console.log('Restored:', restored.deletedAt); // null
 * ```
 */
export async function restore<
  T extends PgTable & {
    id: any;
    deletedAt: any;
    deletedBy: any;
    updatedAt: any;
  }
>(
  table: T,
  id: string,
  userId: string,
  tx?: Transaction
): Promise<any> {
  const executor = tx || db;

  const result = await executor
    .update(table)
    .set({
      deletedAt: null,
      deletedBy: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(table.id, id) as any)
    .returning();

  if (result.length === 0) {
    const tableName = (table as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')] || 'unknown';
    throw new Error(`Record not found: ${tableName} ${id}`);
  }

  return result[0];
}
