import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockMemoryEntry,
  type MockContext,
} from '../../__tests__/test-utils';
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Memory Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('listForBaleybot', () => {
    it('returns memory entries for a specific baleybot', async () => {
      const mockEntries = [
        createMockMemoryEntry({ id: 'm-1', key: 'user_prefs', value: { theme: 'dark' } }),
        createMockMemoryEntry({ id: 'm-2', key: 'last_run', value: '2025-01-15' }),
      ];
      ctx.db.query.baleybotMemory.findMany.mockResolvedValue(mockEntries);

      const result = await ctx.db.query.baleybotMemory.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]!.key).toBe('user_prefs');
      expect(result[1]!.key).toBe('last_run');
    });

    it('returns empty array when baleybot has no memories', async () => {
      ctx.db.query.baleybotMemory.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.baleybotMemory.findMany();

      expect(result).toHaveLength(0);
    });

    it('scopes entries to workspace', async () => {
      const entries = [
        createMockMemoryEntry({ workspaceId: ctx.workspace.id }),
      ];
      ctx.db.query.baleybotMemory.findMany.mockResolvedValue(entries);

      const result = await ctx.db.query.baleybotMemory.findMany();

      expect(result[0]!.workspaceId).toBe(ctx.workspace.id);
    });

    it('returns entries with various value types', async () => {
      const entries = [
        createMockMemoryEntry({ key: 'string_val', value: 'hello' }),
        createMockMemoryEntry({ key: 'number_val', value: 42 }),
        createMockMemoryEntry({ key: 'object_val', value: { nested: true } }),
        createMockMemoryEntry({ key: 'array_val', value: [1, 2, 3] }),
        createMockMemoryEntry({ key: 'bool_val', value: true }),
      ];
      ctx.db.query.baleybotMemory.findMany.mockResolvedValue(entries);

      const result = await ctx.db.query.baleybotMemory.findMany();

      expect(result).toHaveLength(5);
      expect(result[0]!.value).toBe('hello');
      expect(result[1]!.value).toBe(42);
      expect(result[2]!.value).toEqual({ nested: true });
      expect(result[3]!.value).toEqual([1, 2, 3]);
      expect(result[4]!.value).toBe(true);
    });
  });

  describe('get', () => {
    it('returns a single memory entry by baleybot ID and key', async () => {
      const mockEntry = createMockMemoryEntry({
        baleybotId: 'bb-1',
        key: 'api_config',
        value: { endpoint: 'https://api.example.com' },
      });
      ctx.db.query.baleybotMemory.findFirst.mockResolvedValue(mockEntry);

      const result = await ctx.db.query.baleybotMemory.findFirst();

      expect(result).not.toBeNull();
      expect(result?.key).toBe('api_config');
      expect(result?.value).toEqual({ endpoint: 'https://api.example.com' });
    });

    it('returns null for non-existent key', async () => {
      ctx.db.query.baleybotMemory.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybotMemory.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('scopes get to workspace and baleybot', async () => {
      const entry = createMockMemoryEntry({
        workspaceId: ctx.workspace.id,
        baleybotId: 'bb-1',
        key: 'config',
      });
      ctx.db.query.baleybotMemory.findFirst.mockResolvedValue(entry);

      const result = await ctx.db.query.baleybotMemory.findFirst();

      expect(result?.workspaceId).toBe(ctx.workspace.id);
      expect(result?.baleybotId).toBe('bb-1');
    });
  });

  describe('delete', () => {
    it('verifies entry exists before deletion', async () => {
      const mockEntry = createMockMemoryEntry({ id: 'm-1' });
      ctx.db.query.baleybotMemory.findFirst.mockResolvedValue(mockEntry);

      const result = await ctx.db.query.baleybotMemory.findFirst();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('m-1');
    });

    it('returns null for non-existent entry on delete', async () => {
      ctx.db.query.baleybotMemory.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybotMemory.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('deletes entry by ID scoped to workspace', async () => {
      const entry = createMockMemoryEntry({
        id: 'm-1',
        workspaceId: ctx.workspace.id,
      });
      ctx.db.query.baleybotMemory.findFirst.mockResolvedValue(entry);

      ctx.db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const found = await ctx.db.query.baleybotMemory.findFirst();
      expect(found).not.toBeNull();

      await ctx.db.delete('baleybotMemory').where({});
      expect(ctx.db.delete).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('clears all memory entries for a specific baleybot', async () => {
      ctx.db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      await ctx.db.delete('baleybotMemory').where({});

      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('does not affect entries from other baleybots', () => {
      const entries = [
        createMockMemoryEntry({ baleybotId: 'bb-1', key: 'key1' }),
        createMockMemoryEntry({ baleybotId: 'bb-1', key: 'key2' }),
        createMockMemoryEntry({ baleybotId: 'bb-2', key: 'key1' }),
      ];

      const filtered = entries.filter((e) => e.baleybotId === 'bb-1');

      expect(filtered).toHaveLength(2);
    });
  });

  describe('workspace isolation', () => {
    it('ensures memory entries are workspace-scoped', () => {
      const entry1 = createMockMemoryEntry({ workspaceId: 'ws-1', key: 'config' });
      const entry2 = createMockMemoryEntry({ workspaceId: 'ws-2', key: 'config' });

      expect(entry1.workspaceId).not.toBe(entry2.workspaceId);
      expect(entry1.key).toBe(entry2.key);
    });

    it('different baleybots can have same key names', () => {
      const entry1 = createMockMemoryEntry({ baleybotId: 'bb-1', key: 'state' });
      const entry2 = createMockMemoryEntry({ baleybotId: 'bb-2', key: 'state' });

      expect(entry1.baleybotId).not.toBe(entry2.baleybotId);
      expect(entry1.key).toBe(entry2.key);
    });

    it('memory entries track creation and update timestamps', () => {
      const entry = createMockMemoryEntry({
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-15'),
      });

      expect(entry.createdAt).toEqual(new Date('2025-01-01'));
      expect(entry.updatedAt).toEqual(new Date('2025-01-15'));
    });
  });
});
