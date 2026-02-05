/**
 * Memory Storage Service Tests
 *
 * Tests for the store_memory built-in tool's storage service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryStorageService } from '../memory-storage';

// Mock the database module
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybotMemory: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: '1' }]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  },
  baleybotMemory: {
    id: 'id',
    workspaceId: 'workspaceId',
    baleybotId: 'baleybotId',
    key: 'key',
    value: 'value',
  },
  eq: vi.fn((field, value) => ({ field, value })),
  and: vi.fn((...conditions) => conditions),
}));

describe('MemoryStorageService', () => {
  const service = createMemoryStorageService();
  const ctx = {
    workspaceId: 'ws-1',
    baleybotId: 'bb-1',
    executionId: 'exec-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('should return stored value', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybotMemory.findFirst).mockResolvedValue({
        id: '1',
        workspaceId: 'ws-1',
        baleybotId: 'bb-1',
        key: 'test-key',
        value: { data: 'test-value' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.get('test-key', ctx);
      expect(result).toEqual({ data: 'test-value' });
    });

    it('should return null for non-existent key', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybotMemory.findFirst).mockResolvedValue(undefined);

      const result = await service.get('missing-key', ctx);
      expect(result).toBeNull();
    });

    it('should scope query to workspace and baleybot', async () => {
      const { db, eq, and } = await import('@baleyui/db');
      vi.mocked(db.query.baleybotMemory.findFirst).mockResolvedValue(undefined);

      await service.get('my-key', ctx);

      expect(db.query.baleybotMemory.findFirst).toHaveBeenCalledTimes(1);
      expect(and).toHaveBeenCalled();
      // Verify eq was called with correct fields
      expect(eq).toHaveBeenCalledWith(expect.anything(), ctx.workspaceId);
      expect(eq).toHaveBeenCalledWith(expect.anything(), ctx.baleybotId);
      expect(eq).toHaveBeenCalledWith(expect.anything(), 'my-key');
    });
  });

  describe('set', () => {
    it('should update existing record', async () => {
      const { db } = await import('@baleyui/db');
      // Mock update returning a row (record exists)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: '1' }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      await service.set('existing-key', { new: 'value' }, ctx);

      expect(db.update).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should insert new record if update returns empty', async () => {
      const { db } = await import('@baleyui/db');
      // Mock update returning empty (no existing record)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof db.insert>);

      await service.set('new-key', { value: 123 }, ctx);

      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete the key', async () => {
      const { db } = await import('@baleyui/db');

      await service.delete('delete-me', ctx);

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should return all keys for a baleybot', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybotMemory.findMany).mockResolvedValue([
        { key: 'key1' },
        { key: 'key2' },
        { key: 'key3' },
      ] as unknown as Awaited<ReturnType<typeof db.query.baleybotMemory.findMany>>);

      const keys = await service.list(ctx);
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });

    it('should return empty array when no keys exist', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.baleybotMemory.findMany).mockResolvedValue([]);

      const keys = await service.list(ctx);
      expect(keys).toEqual([]);
    });
  });
});
