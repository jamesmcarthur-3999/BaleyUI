import { eq, and, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from './index';
import type { Transaction } from './transactions';

/**
 * Error thrown when an optimistic lock fails due to version mismatch.
 * This indicates that the record was modified by another process
 * between when it was read and when the update was attempted.
 */
export class OptimisticLockError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly expectedVersion: number
  ) {
    super(
      `Optimistic lock failed for ${entityType} ${entityId}. ` +
        `Expected version ${expectedVersion}, but record has been modified. ` +
        `Please refresh and try again.`
    );
    this.name = 'OptimisticLockError';
  }
}

/**
 * Update a record with optimistic locking to prevent lost updates.
 * Increments the version number and only succeeds if the current version matches expectedVersion.
 *
 * @param table - The Drizzle table to update
 * @param id - The record ID
 * @param expectedVersion - The version number the client thinks the record has
 * @param updates - Partial object with fields to update
 * @param tx - Optional transaction to use (if not provided, uses default db connection)
 * @returns The updated record
 * @throws {OptimisticLockError} If the version doesn't match (record was modified by another process)
 *
 * @example
 * ```ts
 * try {
 *   const updated = await updateWithLock(
 *     blocks,
 *     blockId,
 *     3, // version we read
 *     { name: 'Updated Name' }
 *   );
 *   console.log('Updated to version', updated.version); // 4
 * } catch (error) {
 *   if (error instanceof OptimisticLockError) {
 *     // Show user a message to refresh and try again
 *   }
 * }
 * ```
 */
export async function updateWithLock<
  T extends PgTable & {
    id: any;
    version: any;
    updatedAt: any;
  }
>(
  table: T,
  id: string,
  expectedVersion: number,
  updates: Partial<Record<keyof T['_']['columns'], any>>,
  tx?: Transaction
): Promise<any> {
  const executor = tx || db;

  // Build the update query with version check
  const result = await executor
    .update(table)
    .set({
      ...updates,
      version: sql`${table.version} + 1`,
      updatedAt: new Date(),
    } as any)
    .where(
      and(
        eq(table.id, id),
        eq(table.version, expectedVersion)
      ) as any
    )
    .returning();

  if (result.length === 0) {
    // Check if record exists at all
    const current = await executor
      .select({ id: table.id, version: table.version })
      .from(table)
      .where(eq(table.id, id) as any)
      .limit(1);

    if (current.length === 0) {
      const tableName = (table as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')] || 'unknown';
      throw new Error(`Record not found: ${tableName} ${id}`);
    }

    // Record exists but version mismatch
    const tableName = (table as unknown as Record<symbol, string>)[Symbol.for('drizzle:Name')] || 'unknown';
    throw new OptimisticLockError(tableName, id, expectedVersion);
  }

  return result[0];
}
