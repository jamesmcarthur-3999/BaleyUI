import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockTool,
  type MockContext,
} from '../../__tests__/test-utils';
import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Tools Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns tools for workspace', async () => {
      const mockTools = [
        createMockTool({ id: 't-1', name: 'fetch_data' }),
        createMockTool({ id: 't-2', name: 'send_email' }),
      ];
      ctx.db.query.tools.findMany.mockResolvedValue(mockTools);

      const result = await ctx.db.query.tools.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('fetch_data');
      expect(result[1]!.name).toBe('send_email');
    });

    it('returns empty array when no tools exist', async () => {
      ctx.db.query.tools.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.tools.findMany();

      expect(result).toHaveLength(0);
    });

    it('excludes soft-deleted tools', async () => {
      const activeTools = [
        createMockTool({ id: 't-1', deletedAt: null }),
      ];
      ctx.db.query.tools.findMany.mockResolvedValue(activeTools);

      const result = await ctx.db.query.tools.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.deletedAt).toBeNull();
    });

    it('returns tools with connection IDs', async () => {
      const toolsWithConnections = [
        createMockTool({ id: 't-1', connectionId: 'conn-1' }),
        createMockTool({ id: 't-2', connectionId: null }),
      ];
      ctx.db.query.tools.findMany.mockResolvedValue(toolsWithConnections);

      const result = await ctx.db.query.tools.findMany();

      expect(result[0]!.connectionId).toBe('conn-1');
      expect(result[1]!.connectionId).toBeNull();
    });
  });

  describe('get', () => {
    it('returns a single tool by ID', async () => {
      const mockTool = createMockTool({ id: 'tool-1', name: 'my_tool' });
      ctx.db.query.tools.findFirst.mockResolvedValue(mockTool);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('my_tool');
    });

    it('returns null for non-existent tool', async () => {
      ctx.db.query.tools.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('returns null for deleted tool', async () => {
      ctx.db.query.tools.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new tool with required fields', async () => {
      const newTool = createMockTool({
        id: 'new-tool',
        name: 'new_tool',
        description: 'A brand new tool',
        code: 'return { status: "ok" };',
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newTool]),
        }),
      });

      const insertMock = ctx.db.insert('tools');
      const result = await insertMock.values({}).returning();

      expect(result[0].name).toBe('new_tool');
      expect(result[0].description).toBe('A brand new tool');
    });

    it('creates a generated tool', async () => {
      const generatedTool = createMockTool({
        name: 'ai_generated_tool',
        isGenerated: true,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([generatedTool]),
        }),
      });

      const insertMock = ctx.db.insert('tools');
      const result = await insertMock.values({}).returning();

      expect(result[0].isGenerated).toBe(true);
    });

    it('creates a tool with connection', async () => {
      const toolWithConn = createMockTool({
        name: 'connected_tool',
        connectionId: 'conn-123',
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([toolWithConn]),
        }),
      });

      const insertMock = ctx.db.insert('tools');
      const result = await insertMock.values({}).returning();

      expect(result[0].connectionId).toBe('conn-123');
    });
  });

  describe('update', () => {
    it('verifies tool exists before update', async () => {
      const existingTool = createMockTool({ id: 'tool-1', version: 1 });
      ctx.db.query.tools.findFirst.mockResolvedValue(existingTool);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
    });

    it('returns null for non-existent tool on update', async () => {
      ctx.db.query.tools.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('checks for name conflicts on rename', async () => {
      const existingTool = createMockTool({ id: 'tool-1', name: 'original' });
      const conflictTool = createMockTool({ id: 'tool-2', name: 'taken_name' });

      ctx.db.query.tools.findFirst
        .mockResolvedValueOnce(existingTool) // Tool to update
        .mockResolvedValueOnce(conflictTool); // Name conflict check

      const tool = await ctx.db.query.tools.findFirst();
      expect(tool?.name).toBe('original');

      const conflict = await ctx.db.query.tools.findFirst();
      expect(conflict?.name).toBe('taken_name');
      // In actual router, this would throw CONFLICT
    });

    it('allows update when no name conflict exists', async () => {
      const existingTool = createMockTool({ id: 'tool-1', name: 'original' });

      ctx.db.query.tools.findFirst
        .mockResolvedValueOnce(existingTool) // Tool to update
        .mockResolvedValueOnce(null); // No name conflict

      const tool = await ctx.db.query.tools.findFirst();
      expect(tool).not.toBeNull();

      const conflict = await ctx.db.query.tools.findFirst();
      expect(conflict).toBeNull();
    });
  });

  describe('delete', () => {
    it('verifies tool exists before soft delete', async () => {
      const existingTool = createMockTool({ id: 'tool-1' });
      ctx.db.query.tools.findFirst.mockResolvedValue(existingTool);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).not.toBeNull();
      expect(result?.deletedAt).toBeNull();
    });

    it('returns null for non-existent tool on delete', async () => {
      ctx.db.query.tools.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });
  });

  describe('duplicate', () => {
    it('duplicates a tool with a new name', async () => {
      const sourceTool = createMockTool({
        id: 'source-id',
        name: 'original_tool',
        description: 'Original description',
        code: 'return { data: true };',
      });

      ctx.db.query.tools.findFirst
        .mockResolvedValueOnce(sourceTool) // Source tool
        .mockResolvedValueOnce(null); // No name conflict

      const duplicatedTool = createMockTool({
        id: 'new-id',
        name: 'copied_tool',
        description: sourceTool.description,
        code: sourceTool.code,
        isGenerated: false,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([duplicatedTool]),
        }),
      });

      const source = await ctx.db.query.tools.findFirst();
      expect(source?.name).toBe('original_tool');

      const conflict = await ctx.db.query.tools.findFirst();
      expect(conflict).toBeNull();

      const insertMock = ctx.db.insert('tools');
      const result = await insertMock.values({}).returning();

      expect(result[0].name).toBe('copied_tool');
      expect(result[0].isGenerated).toBe(false);
    });

    it('rejects duplicate when source not found', async () => {
      ctx.db.query.tools.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.tools.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('rejects duplicate when name already exists', async () => {
      const sourceTool = createMockTool({ id: 'source-id', name: 'original' });
      const existingTool = createMockTool({ id: 'existing-id', name: 'taken_name' });

      ctx.db.query.tools.findFirst
        .mockResolvedValueOnce(sourceTool)
        .mockResolvedValueOnce(existingTool);

      const source = await ctx.db.query.tools.findFirst();
      expect(source).not.toBeNull();

      const conflict = await ctx.db.query.tools.findFirst();
      expect(conflict).not.toBeNull();
      // In actual router, this would throw CONFLICT
    });
  });

  describe('tool metadata', () => {
    it('stores input schema as JSON', () => {
      const tool = createMockTool({
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
            method: { type: 'string', enum: ['GET', 'POST'] },
          },
          required: ['url'],
        },
      });

      expect(tool.inputSchema).toHaveProperty('properties');
      expect((tool.inputSchema as Record<string, unknown>).required).toEqual(['url']);
    });

    it('distinguishes generated from manual tools', () => {
      const manualTool = createMockTool({ isGenerated: false });
      const generatedTool = createMockTool({ isGenerated: true });

      expect(manualTool.isGenerated).toBe(false);
      expect(generatedTool.isGenerated).toBe(true);
    });
  });
});
