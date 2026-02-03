/**
 * Memory Storage Service
 *
 * Implements persistent key-value storage for the store_memory built-in tool.
 * Data is scoped to workspace + baleybot, surviving across executions.
 */

import { db, baleybotMemory, eq, and } from '@baleyui/db';
import type { BuiltInToolContext } from '../tools/built-in';

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryStorageService {
  get: (key: string, ctx: BuiltInToolContext) => Promise<unknown>;
  set: (key: string, value: unknown, ctx: BuiltInToolContext) => Promise<void>;
  delete: (key: string, ctx: BuiltInToolContext) => Promise<void>;
  list: (ctx: BuiltInToolContext) => Promise<string[]>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Get a value from memory storage
 */
async function getMemory(key: string, ctx: BuiltInToolContext): Promise<unknown> {
  const result = await db.query.baleybotMemory.findFirst({
    where: and(
      eq(baleybotMemory.workspaceId, ctx.workspaceId),
      eq(baleybotMemory.baleybotId, ctx.baleybotId),
      eq(baleybotMemory.key, key)
    ),
  });

  return result?.value ?? null;
}

/**
 * Set a value in memory storage (upsert)
 * Uses ON CONFLICT to handle race conditions safely
 */
async function setMemory(
  key: string,
  value: unknown,
  ctx: BuiltInToolContext
): Promise<void> {
  // Use upsert pattern to avoid race conditions
  // First try to update existing record
  const updateResult = await db
    .update(baleybotMemory)
    .set({
      value,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(baleybotMemory.workspaceId, ctx.workspaceId),
        eq(baleybotMemory.baleybotId, ctx.baleybotId),
        eq(baleybotMemory.key, key)
      )
    )
    .returning({ id: baleybotMemory.id });

  // If no rows updated, insert new record
  if (updateResult.length === 0) {
    try {
      await db.insert(baleybotMemory).values({
        workspaceId: ctx.workspaceId,
        baleybotId: ctx.baleybotId,
        key,
        value,
      });
    } catch (error) {
      // Handle unique constraint violation (race condition)
      // Another request might have inserted between our update and insert
      if (error instanceof Error && error.message.includes('unique')) {
        // Retry update
        await db
          .update(baleybotMemory)
          .set({
            value,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(baleybotMemory.workspaceId, ctx.workspaceId),
              eq(baleybotMemory.baleybotId, ctx.baleybotId),
              eq(baleybotMemory.key, key)
            )
          );
      } else {
        throw error;
      }
    }
  }
}

/**
 * Delete a value from memory storage
 */
async function deleteMemory(key: string, ctx: BuiltInToolContext): Promise<void> {
  await db
    .delete(baleybotMemory)
    .where(
      and(
        eq(baleybotMemory.workspaceId, ctx.workspaceId),
        eq(baleybotMemory.baleybotId, ctx.baleybotId),
        eq(baleybotMemory.key, key)
      )
    );
}

/**
 * List all keys in memory storage for this baleybot
 */
async function listMemory(ctx: BuiltInToolContext): Promise<string[]> {
  const results = await db.query.baleybotMemory.findMany({
    where: and(
      eq(baleybotMemory.workspaceId, ctx.workspaceId),
      eq(baleybotMemory.baleybotId, ctx.baleybotId)
    ),
    columns: { key: true },
  });

  return results.map((r) => r.key);
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

/**
 * Create the memory storage service instance
 */
export function createMemoryStorageService(): MemoryStorageService {
  return {
    get: getMemory,
    set: setMemory,
    delete: deleteMemory,
    list: listMemory,
  };
}

/**
 * Default memory storage service instance
 */
export const memoryStorageService = createMemoryStorageService();
