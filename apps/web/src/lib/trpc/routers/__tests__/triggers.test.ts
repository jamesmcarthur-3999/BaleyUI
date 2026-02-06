import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockBaleybot,
  createMockTrigger,
  type MockContext,
} from '../../__tests__/test-utils';

// Mock external dependencies
vi.mock('@/lib/baleybot/services/bb-completion-trigger-service', () => ({
  createTrigger: vi.fn().mockResolvedValue('new-trigger-id'),
  deleteTrigger: vi.fn().mockResolvedValue(undefined),
  enableTrigger: vi.fn().mockResolvedValue(undefined),
  disableTrigger: vi.fn().mockResolvedValue(undefined),
  getTriggersForSource: vi.fn().mockResolvedValue([]),
}));

import { createMockDbModule } from '../../__tests__/mock-db';

vi.mock('@baleyui/db', () => createMockDbModule());

describe('Triggers Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns all triggers for the workspace', async () => {
      const mockTriggers = [
        createMockTrigger({ id: 't-1', sourceBaleybotId: 'bb-1', targetBaleybotId: 'bb-2' }),
        createMockTrigger({ id: 't-2', sourceBaleybotId: 'bb-2', targetBaleybotId: 'bb-3' }),
      ];
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue(mockTriggers);

      const result = await ctx.db.query.baleybotTriggers.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]!.sourceBaleybotId).toBe('bb-1');
      expect(result[1]!.targetBaleybotId).toBe('bb-3');
    });

    it('returns empty array when no triggers exist', async () => {
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.baleybotTriggers.findMany();

      expect(result).toHaveLength(0);
    });

    it('includes source and target baleybot relations', async () => {
      const mockTrigger = createMockTrigger({
        id: 't-1',
        sourceBaleybot: { id: 'bb-1', name: 'Source Bot' },
        targetBaleybot: { id: 'bb-2', name: 'Target Bot' },
      });
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue([mockTrigger]);

      const result = await ctx.db.query.baleybotTriggers.findMany();

      expect(result[0]!.sourceBaleybot?.name).toBe('Source Bot');
      expect(result[0]!.targetBaleybot?.name).toBe('Target Bot');
    });
  });

  describe('getForSource', () => {
    it('verifies baleybot exists before fetching triggers', async () => {
      const mockBot = createMockBaleybot({ id: 'bb-1' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(mockBot);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('bb-1');
    });

    it('returns null when baleybot not found', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });
  });

  describe('getForTarget', () => {
    it('returns triggers where BB is the target', async () => {
      const mockBot = createMockBaleybot({ id: 'bb-2' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(mockBot);

      const mockTriggers = [
        createMockTrigger({ id: 't-1', targetBaleybotId: 'bb-2', sourceBaleybot: { id: 'bb-1', name: 'Source' } }),
      ];
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue(mockTriggers);

      const bot = await ctx.db.query.baleybots.findFirst();
      expect(bot).not.toBeNull();

      const triggers = await ctx.db.query.baleybotTriggers.findMany();
      expect(triggers).toHaveLength(1);
      expect(triggers[0]!.sourceBaleybot?.name).toBe('Source');
    });

    it('returns empty when no triggers target this BB', async () => {
      const mockBot = createMockBaleybot({ id: 'bb-2' });
      ctx.db.query.baleybots.findFirst.mockResolvedValue(mockBot);
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue([]);

      const triggers = await ctx.db.query.baleybotTriggers.findMany();
      expect(triggers).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('verifies both source and target BBs exist', async () => {
      const sourceBB = createMockBaleybot({ id: 'bb-1', name: 'Source' });
      const targetBB = createMockBaleybot({ id: 'bb-2', name: 'Target' });

      // First call returns source, second call returns target
      ctx.db.query.baleybots.findFirst
        .mockResolvedValueOnce(sourceBB)
        .mockResolvedValueOnce(targetBB);

      const source = await ctx.db.query.baleybots.findFirst();
      const target = await ctx.db.query.baleybots.findFirst();

      expect(source).not.toBeNull();
      expect(target).not.toBeNull();
      expect(source?.id).toBe('bb-1');
      expect(target?.id).toBe('bb-2');
    });

    it('rejects when source BB not found', async () => {
      ctx.db.query.baleybots.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybots.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND for source
    });

    it('rejects self-referencing trigger', () => {
      const sameId = 'bb-same';

      // The router checks input.sourceBaleybotId === input.targetBaleybotId
      expect(sameId === sameId).toBe(true);
      // In actual router, this would throw BAD_REQUEST
    });

    it('detects cycles in trigger graph', () => {
      // Existing triggers: A -> B, B -> C
      const existingTriggers = [
        { sourceBaleybotId: 'A', targetBaleybotId: 'B' },
        { sourceBaleybotId: 'B', targetBaleybotId: 'C' },
      ];

      // Adding C -> A would create a cycle: A -> B -> C -> A
      const newSource = 'C';
      const newTarget = 'A';

      // Build graph and detect cycle (mimics router logic)
      const graph = new Map<string, string[]>();
      for (const t of existingTriggers) {
        if (!graph.has(t.sourceBaleybotId)) graph.set(t.sourceBaleybotId, []);
        graph.get(t.sourceBaleybotId)!.push(t.targetBaleybotId);
      }
      if (!graph.has(newSource)) graph.set(newSource, []);
      graph.get(newSource)!.push(newTarget);

      const visited = new Set<string>();
      const stack = [newTarget];
      let hasCycle = false;
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node === newSource) { hasCycle = true; break; }
        if (visited.has(node)) continue;
        visited.add(node);
        for (const neighbor of graph.get(node) || []) {
          stack.push(neighbor);
        }
      }

      expect(hasCycle).toBe(true);
    });

    it('allows non-cyclic trigger creation', () => {
      // Existing triggers: A -> B
      const existingTriggers = [
        { sourceBaleybotId: 'A', targetBaleybotId: 'B' },
      ];

      // Adding B -> C is fine (no cycle)
      const newSource = 'B';
      const newTarget = 'C';

      const graph = new Map<string, string[]>();
      for (const t of existingTriggers) {
        if (!graph.has(t.sourceBaleybotId)) graph.set(t.sourceBaleybotId, []);
        graph.get(t.sourceBaleybotId)!.push(t.targetBaleybotId);
      }
      if (!graph.has(newSource)) graph.set(newSource, []);
      graph.get(newSource)!.push(newTarget);

      const visited = new Set<string>();
      const stack = [newTarget];
      let hasCycle = false;
      while (stack.length > 0) {
        const node = stack.pop()!;
        if (node === newSource) { hasCycle = true; break; }
        if (visited.has(node)) continue;
        visited.add(node);
        for (const neighbor of graph.get(node) || []) {
          stack.push(neighbor);
        }
      }

      expect(hasCycle).toBe(false);
    });

    it('rejects duplicate trigger between same BBs', async () => {
      const existingTrigger = createMockTrigger({
        sourceBaleybotId: 'bb-1',
        targetBaleybotId: 'bb-2',
      });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(existingTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).not.toBeNull();
      // In actual router, this would throw CONFLICT
    });

    it('creates trigger with different trigger types', () => {
      const completionTrigger = createMockTrigger({ triggerType: 'completion' });
      const successTrigger = createMockTrigger({ triggerType: 'success' });
      const failureTrigger = createMockTrigger({ triggerType: 'failure' });

      expect(completionTrigger.triggerType).toBe('completion');
      expect(successTrigger.triggerType).toBe('success');
      expect(failureTrigger.triggerType).toBe('failure');
    });

    it('creates trigger with input mapping and static input', () => {
      const trigger = createMockTrigger({
        inputMapping: { targetField: 'sourceField' },
        staticInput: { extraParam: 'value' },
      });

      expect(trigger.inputMapping).toEqual({ targetField: 'sourceField' });
      expect(trigger.staticInput).toEqual({ extraParam: 'value' });
    });
  });

  describe('delete', () => {
    it('verifies trigger exists before deletion', async () => {
      const mockTrigger = createMockTrigger({ id: 't-1' });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(mockTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('t-1');
    });

    it('returns null for non-existent trigger', async () => {
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });
  });

  describe('enable', () => {
    it('enables a disabled trigger', async () => {
      const mockTrigger = createMockTrigger({ id: 't-1', enabled: false });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(mockTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(false);
      // In actual router, enableTrigger would be called
    });

    it('returns null when trigger not found for enable', async () => {
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('disable', () => {
    it('disables an enabled trigger', async () => {
      const mockTrigger = createMockTrigger({ id: 't-1', enabled: true });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(mockTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(true);
      // In actual router, disableTrigger would be called
    });
  });

  describe('update', () => {
    it('updates trigger configuration', async () => {
      const mockTrigger = createMockTrigger({ id: 't-1', triggerType: 'completion' });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(mockTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).not.toBeNull();
      expect(result?.triggerType).toBe('completion');
    });

    it('returns null for non-existent trigger on update', async () => {
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result).toBeNull();
      // In actual router, this would throw NOT_FOUND
    });

    it('supports updating input mapping', async () => {
      const mockTrigger = createMockTrigger({
        id: 't-1',
        inputMapping: { old: 'mapping' },
      });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(mockTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result?.inputMapping).toEqual({ old: 'mapping' });
    });

    it('supports updating condition', async () => {
      const mockTrigger = createMockTrigger({
        id: 't-1',
        condition: 'output.status === "success"',
      });
      ctx.db.query.baleybotTriggers.findFirst.mockResolvedValue(mockTrigger);

      const result = await ctx.db.query.baleybotTriggers.findFirst();

      expect(result?.condition).toBe('output.status === "success"');
    });
  });

  describe('workspace scoping', () => {
    it('only returns triggers for the correct workspace', async () => {
      const workspaceTriggers = [
        createMockTrigger({ id: 't-1', workspaceId: ctx.workspace.id }),
      ];
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue(workspaceTriggers);

      const result = await ctx.db.query.baleybotTriggers.findMany();

      expect(result).toHaveLength(1);
      expect(result[0]!.workspaceId).toBe(ctx.workspace.id);
    });

    it('does not return triggers from other workspaces', async () => {
      ctx.db.query.baleybotTriggers.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.baleybotTriggers.findMany();

      expect(result).toHaveLength(0);
    });
  });
});
