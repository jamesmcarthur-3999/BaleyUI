/**
 * Test suite for Data Integrity Layer
 *
 * These tests demonstrate the functionality of:
 * - Transactions (withTransaction)
 * - Optimistic Locking (updateWithLock)
 * - Soft Deletes (softDelete, restore, notDeleted)
 *
 * Note: These are example tests. In a real environment, you would:
 * 1. Set up a test database
 * 2. Use beforeEach/afterEach to reset state
 * 3. Mock the database connection
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  db,
  blocks,
  tools,
  workspaces,
  eq,
  sql,
  withTransaction,
  updateWithLock,
  OptimisticLockError,
  softDelete,
  restore,
  notDeleted,
} from '../index';

describe('withTransaction', () => {
  test('commits transaction on success', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace',
        ownerId: 'test-user',
      })
      .returning();

    const result = await withTransaction(async (tx) => {
      const block = await tx
        .insert(blocks)
        .values({
          name: 'Test Block',
          type: 'ai',
          workspaceId: workspace[0]!.id,
        })
        .returning();

      const tool = await tx
        .insert(tools)
        .values({
          name: 'Test Tool',
          description: 'A test tool',
          inputSchema: {},
          code: 'return {}',
          workspaceId: workspace[0]!.id,
        })
        .returning();

      return { block: block[0]!, tool: tool[0]! };
    });

    expect(result.block!.name).toBe('Test Block');
    expect(result.tool!.name).toBe('Test Tool');

    // Verify data was committed
    const savedBlock = await db.query.blocks.findFirst({
      where: eq(blocks.id, result.block!.id),
    });
    expect(savedBlock).toBeDefined();
  });

  test('rolls back transaction on error', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-rollback',
        ownerId: 'test-user',
      })
      .returning();

    const initialCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blocks);

    await expect(
      withTransaction(async (tx) => {
        await tx.insert(blocks).values({
          name: 'Test Block',
          type: 'ai',
          workspaceId: workspace[0]!.id,
        });

        // Simulate an error
        throw new Error('Simulated error');
      })
    ).rejects.toThrow('Simulated error');

    // Verify rollback - count should be the same
    const finalCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(blocks);

    expect(finalCount[0]!.count).toBe(initialCount[0]!.count);
  });
});

describe('updateWithLock', () => {
  test('successfully updates with correct version', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-lock',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Original Name',
        type: 'ai',
        workspaceId: workspace[0]!.id,
        version: 1,
      })
      .returning();

    const updated = await updateWithLock(
      blocks,
      block[0]!.id,
      1,
      { name: 'Updated Name' }
    );

    expect(updated.name).toBe('Updated Name');
    expect(updated.version).toBe(2);
  });

  test('fails with OptimisticLockError on version mismatch', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-lock-fail',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Original Name',
        type: 'ai',
        workspaceId: workspace[0]!.id,
        version: 1,
      })
      .returning();

    // Simulate concurrent update
    await db
      .update(blocks)
      .set({ version: 2, name: 'Changed by someone else' })
      .where(eq(blocks.id, block[0]!.id));

    // This should fail because version is now 2, not 1
    await expect(
      updateWithLock(blocks, block[0]!.id, 1, { name: 'My Update' })
    ).rejects.toThrow(OptimisticLockError);
  });

  test('includes helpful error message on version mismatch', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-lock-message',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Test',
        type: 'ai',
        workspaceId: workspace[0]!.id,
        version: 1,
      })
      .returning();

    await db
      .update(blocks)
      .set({ version: 2 })
      .where(eq(blocks.id, block[0]!.id));

    try {
      await updateWithLock(blocks, block[0]!.id, 1, { name: 'Update' });
      expect.fail('Should have thrown OptimisticLockError');
    } catch (error) {
      expect(error).toBeInstanceOf(OptimisticLockError);
      expect((error as OptimisticLockError).message).toContain('blocks');
      expect((error as OptimisticLockError).message).toContain(
        'Expected version 1'
      );
      expect((error as OptimisticLockError).expectedVersion).toBe(1);
    }
  });
});

describe('soft delete', () => {
  test('softDelete sets deletedAt and deletedBy', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-delete',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Test Block',
        type: 'ai',
        workspaceId: workspace[0]!.id,
      })
      .returning();

    const deleted = await softDelete(blocks, block[0]!.id, 'user-123');

    expect(deleted.deletedAt).toBeDefined();
    expect(deleted.deletedBy).toBe('user-123');
  });

  test('notDeleted filters out soft-deleted records', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-filter',
        ownerId: 'test-user',
      })
      .returning();

    const block1 = await db
      .insert(blocks)
      .values({
        name: 'Active Block',
        type: 'ai',
        workspaceId: workspace[0]!.id,
      })
      .returning();

    const block2 = await db
      .insert(blocks)
      .values({
        name: 'Deleted Block',
        type: 'ai',
        workspaceId: workspace[0]!.id,
      })
      .returning();

    // Soft delete block2
    await softDelete(blocks, block2[0]!.id, 'user-123');

    // Query with notDeleted filter
    const activeBlocks = await db.query.blocks.findMany({
      where: notDeleted(blocks),
    });

    expect(activeBlocks.length).toBeGreaterThanOrEqual(1);
    expect(activeBlocks.some((b) => b.id === block1[0]!.id)).toBe(true);
    expect(activeBlocks.some((b) => b.id === block2[0]!.id)).toBe(false);
  });

  test('restore clears deletedAt and deletedBy', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-restore',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Test Block',
        type: 'ai',
        workspaceId: workspace[0]!.id,
      })
      .returning();

    // Soft delete
    await softDelete(blocks, block[0]!.id, 'user-123');

    // Restore
    const restored = await restore(blocks, block[0]!.id, 'user-456');

    expect(restored.deletedAt).toBeNull();
    expect(restored.deletedBy).toBeNull();

    // Verify it appears in notDeleted queries
    const activeBlocks = await db.query.blocks.findMany({
      where: notDeleted(blocks),
    });

    expect(activeBlocks.some((b) => b.id === block[0]!.id)).toBe(true);
  });

  test('softDelete fails if already deleted', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-double-delete',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Test Block',
        type: 'ai',
        workspaceId: workspace[0]!.id,
      })
      .returning();

    // First delete succeeds
    await softDelete(blocks, block[0]!.id, 'user-123');

    // Second delete should fail
    await expect(
      softDelete(blocks, block[0]!.id, 'user-123')
    ).rejects.toThrow('Record not found or already deleted');
  });
});

describe('combined usage', () => {
  test('transaction with optimistic lock', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-combined',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'Original',
        type: 'ai',
        workspaceId: workspace[0]!.id,
        version: 1,
      })
      .returning();

    const result = await withTransaction(async (tx) => {
      // Update with optimistic lock inside transaction
      const updated = await updateWithLock(
        blocks,
        block[0]!.id,
        1,
        { name: 'Updated in Transaction' },
        tx
      );

      // Create related tool
      const tool = await tx
        .insert(tools)
        .values({
          name: 'Related Tool',
          description: 'Tool for block',
          inputSchema: {},
          code: 'return {}',
          workspaceId: workspace[0]!.id,
        })
        .returning();

      return { block: updated, tool: tool[0]! };
    });

    expect(result.block.name).toBe('Updated in Transaction');
    expect(result.block.version).toBe(2);
    expect(result.tool!.name).toBe('Related Tool');
  });

  test('soft delete within transaction', async () => {
    const workspace = await db
      .insert(workspaces)
      .values({
        name: 'Test Workspace',
        slug: 'test-workspace-delete-tx',
        ownerId: 'test-user',
      })
      .returning();

    const block = await db
      .insert(blocks)
      .values({
        name: 'To Delete',
        type: 'ai',
        workspaceId: workspace[0]!.id,
      })
      .returning();

    await withTransaction(async (tx) => {
      const deleted = await softDelete(blocks, block[0]!.id, 'user-123', tx);
      expect(deleted.deletedAt).toBeDefined();
    });

    // Verify deletion persisted
    const found = await db.query.blocks.findFirst({
      where: eq(blocks.id, block[0]!.id),
    });

    expect(found?.deletedAt).toBeDefined();
  });
});
