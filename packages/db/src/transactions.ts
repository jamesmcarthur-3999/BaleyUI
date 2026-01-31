import { db } from './index';
import type postgres from 'postgres';

/**
 * Transaction type from postgres.js
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Execute a function within a database transaction.
 * Automatically rolls back on error and commits on success.
 *
 * @param fn - Function to execute within the transaction. Receives transaction client as parameter.
 * @returns The result of the function execution
 * @throws Any error thrown by the function will cause a rollback
 *
 * @example
 * ```ts
 * const result = await withTransaction(async (tx) => {
 *   const block = await tx.insert(blocks).values({ name: 'New Block' }).returning();
 *   const tool = await tx.insert(tools).values({ blockId: block[0].id, name: 'Tool' }).returning();
 *   return { block: block[0], tool: tool[0] };
 * });
 * ```
 */
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await fn(tx);
  });
}
