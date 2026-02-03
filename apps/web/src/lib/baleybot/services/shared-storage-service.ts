/**
 * Shared Storage Service
 *
 * Provides workspace-scoped key-value storage for cross-BB communication.
 * BBs can write data that other BBs in the same workspace can read,
 * enabling async workflows where BBs don't run in sequence but need
 * to share data.
 */

import {
  db,
  baleybotSharedStorage,
  eq,
  and,
  lte,
} from '@baleyui/db';

// ============================================================================
// TYPES
// ============================================================================

export interface SharedStorageEntry {
  key: string;
  value: unknown;
  producerId?: string;
  executionId?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedStorageWriteOptions {
  /** ID of the BB writing the value */
  producerId?: string;
  /** ID of the execution writing the value */
  executionId?: string;
  /** TTL in seconds (optional) */
  ttlSeconds?: number;
}

export interface SharedStorageService {
  /**
   * Write a value to shared storage
   * Overwrites existing value for the same key
   */
  write(
    workspaceId: string,
    key: string,
    value: unknown,
    options?: SharedStorageWriteOptions
  ): Promise<void>;

  /**
   * Read a value from shared storage
   * Returns null if key doesn't exist or has expired
   */
  read(workspaceId: string, key: string): Promise<unknown | null>;

  /**
   * Read a value with full metadata
   */
  readWithMetadata(
    workspaceId: string,
    key: string
  ): Promise<SharedStorageEntry | null>;

  /**
   * Delete a value from shared storage
   */
  delete(workspaceId: string, key: string): Promise<boolean>;

  /**
   * List all keys in workspace (with optional prefix filter)
   */
  listKeys(workspaceId: string, prefix?: string): Promise<string[]>;

  /**
   * Clean up expired entries (called by cron job)
   */
  cleanupExpired(): Promise<number>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Create a shared storage service instance
 */
export function createSharedStorageService(): SharedStorageService {
  return {
    async write(
      workspaceId: string,
      key: string,
      value: unknown,
      options?: SharedStorageWriteOptions
    ): Promise<void> {
      const now = new Date();
      const expiresAt = options?.ttlSeconds
        ? new Date(now.getTime() + options.ttlSeconds * 1000)
        : null;

      // Upsert: insert or update on conflict
      await db
        .insert(baleybotSharedStorage)
        .values({
          workspaceId,
          key,
          value: value as Record<string, unknown>,
          producerId: options?.producerId,
          executionId: options?.executionId,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [baleybotSharedStorage.workspaceId, baleybotSharedStorage.key],
          set: {
            value: value as Record<string, unknown>,
            producerId: options?.producerId,
            executionId: options?.executionId,
            expiresAt,
            updatedAt: now,
          },
        });

      console.log(
        `[shared_storage] Wrote key "${key}" in workspace ${workspaceId}`
      );
    },

    async read(workspaceId: string, key: string): Promise<unknown | null> {
      const entry = await this.readWithMetadata(workspaceId, key);
      return entry?.value ?? null;
    },

    async readWithMetadata(
      workspaceId: string,
      key: string
    ): Promise<SharedStorageEntry | null> {
      const result = await db.query.baleybotSharedStorage.findFirst({
        where: and(
          eq(baleybotSharedStorage.workspaceId, workspaceId),
          eq(baleybotSharedStorage.key, key)
        ),
      });

      if (!result) {
        return null;
      }

      // Check if expired
      if (result.expiresAt && result.expiresAt < new Date()) {
        // Clean up expired entry
        await db
          .delete(baleybotSharedStorage)
          .where(eq(baleybotSharedStorage.id, result.id));
        return null;
      }

      return {
        key: result.key,
        value: result.value,
        producerId: result.producerId ?? undefined,
        executionId: result.executionId ?? undefined,
        expiresAt: result.expiresAt ?? undefined,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    },

    async delete(workspaceId: string, key: string): Promise<boolean> {
      const result = await db
        .delete(baleybotSharedStorage)
        .where(
          and(
            eq(baleybotSharedStorage.workspaceId, workspaceId),
            eq(baleybotSharedStorage.key, key)
          )
        )
        .returning({ id: baleybotSharedStorage.id });

      const deleted = result.length > 0;
      if (deleted) {
        console.log(
          `[shared_storage] Deleted key "${key}" from workspace ${workspaceId}`
        );
      }
      return deleted;
    },

    async listKeys(workspaceId: string, prefix?: string): Promise<string[]> {
      const entries = await db.query.baleybotSharedStorage.findMany({
        where: eq(baleybotSharedStorage.workspaceId, workspaceId),
        columns: {
          key: true,
          expiresAt: true,
        },
      });

      const now = new Date();
      let keys = entries
        .filter((e) => !e.expiresAt || e.expiresAt > now)
        .map((e) => e.key);

      if (prefix) {
        keys = keys.filter((k) => k.startsWith(prefix));
      }

      return keys;
    },

    async cleanupExpired(): Promise<number> {
      const now = new Date();
      const result = await db
        .delete(baleybotSharedStorage)
        .where(lte(baleybotSharedStorage.expiresAt, now))
        .returning({ id: baleybotSharedStorage.id });

      if (result.length > 0) {
        console.log(
          `[shared_storage] Cleaned up ${result.length} expired entries`
        );
      }

      return result.length;
    },
  };
}

/**
 * Default shared storage service instance
 */
export const sharedStorageService = createSharedStorageService();

// ============================================================================
// BUILT-IN TOOL HELPER
// ============================================================================

/**
 * Result type for shared_storage tool
 */
export interface SharedStorageResult {
  success: boolean;
  action: 'write' | 'read' | 'delete' | 'list';
  key?: string;
  value?: unknown;
  keys?: string[];
  error?: string;
}

/**
 * Create the shared_storage tool implementation
 * This wraps the service for use by the built-in tool system
 */
export function createSharedStorageToolImpl(): (
  args: {
    action: 'write' | 'read' | 'delete' | 'list';
    key?: string;
    value?: unknown;
    ttl_seconds?: number;
    prefix?: string;
  },
  ctx: { workspaceId: string; baleybotId?: string; executionId?: string }
) => Promise<SharedStorageResult> {
  return async (args, ctx) => {
    try {
      switch (args.action) {
        case 'write': {
          if (!args.key) {
            return { success: false, action: 'write', error: 'Key is required for write' };
          }
          await sharedStorageService.write(ctx.workspaceId, args.key, args.value, {
            producerId: ctx.baleybotId,
            executionId: ctx.executionId,
            ttlSeconds: args.ttl_seconds,
          });
          return { success: true, action: 'write', key: args.key };
        }

        case 'read': {
          if (!args.key) {
            return { success: false, action: 'read', error: 'Key is required for read' };
          }
          const value = await sharedStorageService.read(ctx.workspaceId, args.key);
          return { success: true, action: 'read', key: args.key, value };
        }

        case 'delete': {
          if (!args.key) {
            return { success: false, action: 'delete', error: 'Key is required for delete' };
          }
          const deleted = await sharedStorageService.delete(ctx.workspaceId, args.key);
          return { success: deleted, action: 'delete', key: args.key };
        }

        case 'list': {
          const keys = await sharedStorageService.listKeys(
            ctx.workspaceId,
            args.prefix
          );
          return { success: true, action: 'list', keys };
        }

        default:
          return { success: false, action: args.action, error: 'Invalid action' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, action: args.action, error: message };
    }
  };
}
