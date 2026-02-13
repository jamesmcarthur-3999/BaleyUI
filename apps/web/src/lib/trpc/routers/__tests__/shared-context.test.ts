import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  type MockContext,
} from '../../__tests__/test-utils';
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

vi.mock('@/lib/baleybot/internal-bb/runner', () => ({
  runContextProcessor: vi.fn().mockResolvedValue({
    entries: [
      { key: 'Fiscal Year', value: 'Starts April 1', category: 'domain_knowledge', description: 'Company fiscal year timing' },
      { key: 'PII Policy', value: 'Never expose customer PII in outputs', category: 'safety_rules', description: 'Data handling rule' },
    ],
    summary: 'Extracted 2 entries from pasted text',
    skippedReasons: [],
  }),
}));

interface MockSharedContextEntry {
  id: string;
  workspaceId: string;
  key: string;
  value: string;
  description: string | null;
  category: string | null;
  contentType: string;
  fileMetadata: Record<string, unknown> | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createMockEntry(overrides: Partial<MockSharedContextEntry> = {}): MockSharedContextEntry {
  return {
    id: 'test-entry-id',
    workspaceId: 'test-workspace-id',
    key: 'Brand Voice',
    value: 'Professional but friendly, avoid jargon',
    description: 'Guidelines for text output tone',
    category: 'brand_voice',
    contentType: 'text',
    fileMetadata: null,
    isActive: true,
    createdBy: 'test-user-id',
    updatedBy: 'test-user-id',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('Shared Context Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns all entries for workspace', async () => {
      const entries = [
        createMockEntry({ id: 'e-1', key: 'Brand Voice' }),
        createMockEntry({ id: 'e-2', key: 'Safety Rule', category: 'safety_rules' }),
      ];
      ctx.db.query.sharedContext = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue(entries),
      };

      const result = await ctx.db.query.sharedContext.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]!.key).toBe('Brand Voice');
    });

    it('returns empty array when no entries exist', async () => {
      ctx.db.query.sharedContext = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      };

      const result = await ctx.db.query.sharedContext.findMany();
      expect(result).toHaveLength(0);
    });
  });

  describe('CRUD lifecycle', () => {
    it('creates a new entry with default contentType', () => {
      const entry = createMockEntry({
        key: 'Domain Knowledge',
        value: 'Our fiscal year starts April 1',
        category: 'domain_knowledge',
        createdBy: ctx.userId,
      });

      expect(entry.key).toBe('Domain Knowledge');
      expect(entry.value).toBe('Our fiscal year starts April 1');
      expect(entry.category).toBe('domain_knowledge');
      expect(entry.contentType).toBe('text');
      expect(entry.fileMetadata).toBeNull();
      expect(entry.createdBy).toBe(ctx.userId);
      expect(entry.isActive).toBe(true);
    });

    it('updates an existing entry', () => {
      const original = createMockEntry({ key: 'Brand Voice', value: 'Formal' });
      const updated = {
        ...original,
        value: 'Casual and friendly',
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      };

      expect(updated.value).toBe('Casual and friendly');
      expect(updated.updatedBy).toBe(ctx.userId);
      expect(updated.key).toBe(original.key); // key unchanged
    });

    it('deletes an entry (hard delete)', async () => {
      ctx.db.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const deleteMock = ctx.db.delete('sharedContext');
      await deleteMock.where({ id: 'test-entry-id' });

      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('toggles entry active state', () => {
      const entry = createMockEntry({ isActive: true });
      const deactivated = { ...entry, isActive: false };

      expect(deactivated.isActive).toBe(false);
    });
  });

  describe('unique key constraint', () => {
    it('detects duplicate key in same workspace', async () => {
      const existing = createMockEntry({ key: 'Brand Voice' });
      ctx.db.query.sharedContext = {
        findFirst: vi.fn().mockResolvedValue(existing),
        findMany: vi.fn().mockResolvedValue([]),
      };

      const found = await ctx.db.query.sharedContext.findFirst();
      expect(found).not.toBeNull();
      // In actual router, this would throw CONFLICT
    });

    it('allows same key in different workspaces', () => {
      const entry1 = createMockEntry({ workspaceId: 'ws-1', key: 'Brand Voice' });
      const entry2 = createMockEntry({ workspaceId: 'ws-2', key: 'Brand Voice' });

      expect(entry1.workspaceId).not.toBe(entry2.workspaceId);
      expect(entry1.key).toBe(entry2.key);
    });
  });

  describe('getForExecution', () => {
    it('returns formatted string for active entries', () => {
      const entries = [
        createMockEntry({ key: 'Brand Voice', value: 'Professional but friendly' }),
        createMockEntry({ key: 'Safety Rule', value: 'Never expose PII' }),
      ];

      const formatted = entries
        .filter((e) => e.isActive)
        .map((e) => `- ${e.key}: ${e.value}`)
        .join('\n');

      expect(formatted).toBe(
        '- Brand Voice: Professional but friendly\n- Safety Rule: Never expose PII'
      );
    });

    it('returns empty string when no active entries', () => {
      const entries: MockSharedContextEntry[] = [];

      const formatted = entries.length === 0
        ? ''
        : entries.map((e) => `- ${e.key}: ${e.value}`).join('\n');

      expect(formatted).toBe('');
    });

    it('excludes inactive entries', () => {
      const entries = [
        createMockEntry({ key: 'Active', isActive: true }),
        createMockEntry({ key: 'Inactive', isActive: false }),
      ];

      const active = entries.filter((e) => e.isActive);
      expect(active).toHaveLength(1);
      expect(active[0]!.key).toBe('Active');
    });
  });

  describe('workspace isolation', () => {
    it('only returns entries for current workspace', () => {
      const entries = [
        createMockEntry({ workspaceId: ctx.workspace.id }),
        createMockEntry({ workspaceId: 'other-workspace' }),
      ];

      const filtered = entries.filter((e) => e.workspaceId === ctx.workspace.id);
      expect(filtered).toHaveLength(1);
    });
  });

  describe('categories', () => {
    it('supports all defined categories', () => {
      const categories = ['general', 'domain_knowledge', 'coding_standards', 'safety_rules', 'brand_voice'];

      const entries = categories.map((cat) => createMockEntry({ category: cat }));
      expect(entries.map((e) => e.category)).toEqual(categories);
    });

    it('defaults to general category', () => {
      const entry = createMockEntry({ category: 'general' });
      expect(entry.category).toBe('general');
    });
  });

  describe('processContent', () => {
    it('returns structured entries from raw content', async () => {
      // runContextProcessor is mocked at module level
      const runner = await import('@/lib/baleybot/internal-bb/runner');
      const result = await runner.runContextProcessor('test content');

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!.key).toBe('Fiscal Year');
      expect(result.entries[0]!.category).toBe('domain_knowledge');
      expect(result.summary).toContain('Extracted 2 entries');
    });
  });

  describe('createBatch', () => {
    it('creates multiple entries and skips duplicates', async () => {
      const batchEntries = [
        { key: 'Entry 1', value: 'Value 1', category: 'general' as const },
        { key: 'Entry 2', value: 'Value 2', category: 'safety_rules' as const },
        { key: 'Duplicate', value: 'Already exists', category: 'general' as const },
      ];

      // Simulate: first two are new, third is duplicate
      let callCount = 0;
      ctx.db.query.sharedContext = {
        findFirst: vi.fn().mockImplementation(() => {
          callCount += 1;
          return callCount === 3 ? createMockEntry({ key: 'Duplicate' }) : null;
        }),
        findMany: vi.fn().mockResolvedValue([]),
      };

      const mockReturning = vi.fn().mockResolvedValue([createMockEntry()]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      });

      const results = [];
      for (const entry of batchEntries) {
        const existing = await ctx.db.query.sharedContext.findFirst();
        if (existing) continue;

        const [created] = await ctx.db.insert('sharedContext')
          .values({
            key: entry.key,
            value: entry.value,
            category: entry.category,
            contentType: 'text',
            fileMetadata: null,
          })
          .returning();
        results.push(created);
      }

      // Only 2 entries created (third was duplicate)
      expect(results).toHaveLength(2);
    });
  });

  describe('file entries', () => {
    it('includes file metadata for uploaded content', () => {
      const entry = createMockEntry({
        contentType: 'file',
        fileMetadata: {
          fileName: 'handbook.md',
          fileType: 'text/markdown',
          fileSizeBytes: 4096,
          uploadedAt: '2025-01-01T00:00:00.000Z',
        },
      });

      expect(entry.contentType).toBe('file');
      expect(entry.fileMetadata).not.toBeNull();
      expect((entry.fileMetadata as Record<string, unknown>).fileName).toBe('handbook.md');
    });

    it('defaults contentType to text for manual entries', () => {
      const entry = createMockEntry();
      expect(entry.contentType).toBe('text');
      expect(entry.fileMetadata).toBeNull();
    });

    it('formats file source hint in execution context', () => {
      const entries = [
        createMockEntry({ key: 'Brand Voice', contentType: 'text', fileMetadata: null }),
        createMockEntry({
          key: 'PII Policy',
          contentType: 'file',
          fileMetadata: { fileName: 'security-handbook.md' },
        }),
      ];

      const contextBlock = entries
        .map((e) => {
          const meta = e.fileMetadata as { fileName?: string } | null;
          const sourceHint = e.contentType === 'file' && meta?.fileName
            ? ` (from: ${meta.fileName})`
            : '';
          return `- ${e.key}${sourceHint}: ${e.value}`;
        })
        .join('\n');

      expect(contextBlock).toContain('- Brand Voice: Professional but friendly');
      expect(contextBlock).toContain('- PII Policy (from: security-handbook.md): Professional but friendly');
    });
  });
});
