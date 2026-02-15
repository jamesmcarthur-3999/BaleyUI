/**
 * Spawn Executor Tests
 *
 * Tests for workspace policy enforcement in the spawn executor.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSpawnBaleybotExecutor,
  extractToolsFromBAL,
} from '../spawn-executor';

// Helper type for partial mock data
type PartialBB = { id: string; name: string; balCode: string };

// Mock the database module
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      baleybots: {
        findFirst: vi.fn(),
      },
      workspacePolicies: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 'exec-123' }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
  baleybots: { id: 'id', workspaceId: 'workspaceId', name: 'name' },
  baleybotExecutions: { id: 'id' },
  workspacePolicies: { workspaceId: 'workspaceId' },
  eq: vi.fn(),
  and: vi.fn(),
  notDeleted: vi.fn(),
}));

// Mock the system workspace
vi.mock('@/lib/system-workspace', () => ({
  getOrCreateSystemWorkspace: vi.fn().mockResolvedValue('system-ws-id'),
}));

// Mock the executor
vi.mock('../../executor', () => ({
  executeBaleybot: vi.fn().mockResolvedValue({
    status: 'completed',
    output: 'success',
  }),
}));

// Mock the built-in tools
vi.mock('../../tools/built-in/implementations', () => ({
  getBuiltInRuntimeTools: vi.fn(() => new Map()),
}));

/**
 * Helper to create mock BB data for tests.
 * Uses `as any` to bypass strict typing on mock data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockBB(data: PartialBB): any {
  return data;
}

describe('SpawnBaleybotExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractToolsFromBAL', () => {
    it('should extract tools from BAL code', () => {
      const balCode = `
        analyzer {
          "goal": "Analyze data",
          "tools": { "database_query", "web_search", "fetch_url" }
        }
      `;

      const tools = extractToolsFromBAL(balCode);
      expect(tools).toEqual(['database_query', 'web_search', 'fetch_url']);
    });

    it('should return empty array for BAL without tools', () => {
      const balCode = `
        simple {
          "goal": "Just respond"
        }
      `;

      const tools = extractToolsFromBAL(balCode);
      expect(tools).toEqual([]);
    });

    it('should handle single tool', () => {
      const balCode = `bot { "tools": { "only_one" } }`;

      const tools = extractToolsFromBAL(balCode);
      expect(tools).toEqual(['only_one']);
    });

    it('should handle empty tools set', () => {
      const balCode = `bot { "tools": { } }`;

      const tools = extractToolsFromBAL(balCode);
      expect(tools).toEqual([]);
    });
  });

  describe('workspace policies enforcement', () => {
    it('should reject spawn if target BB uses forbidden tools', async () => {
      const { db } = await import('@baleyui/db');

      // Mock: BB lookup returns a bot with database_query tool
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'data-bot',
          balCode: 'bot { "tools": { "database_query", "web_search" } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => ({
          forbiddenTools: ['database_query'],
          allowedTools: null,
          requiresApprovalTools: null,
        }),
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
      };

      await expect(executor('data-bot', {}, ctx)).rejects.toThrow(
        /forbidden.*database_query/i
      );
    });

    it('should allow spawn if tools are not forbidden', async () => {
      const { db } = await import('@baleyui/db');

      // Mock: BB lookup returns a bot with allowed tools
      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'safe-bot',
          balCode: 'bot { "tools": { "web_search", "fetch_url" } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => ({
          forbiddenTools: ['database_query'], // Only database_query forbidden
          allowedTools: null,
          requiresApprovalTools: null,
        }),
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
      };

      // Should not throw
      await expect(executor('safe-bot', {}, ctx)).resolves.toBeDefined();
    });

    it('should respect maxSpawnDepth from policies', async () => {
      const { db } = await import('@baleyui/db');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'nested-bot',
          balCode: 'bot { "tools": { } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => ({
          maxSpawnDepth: 2, // Very shallow limit
          forbiddenTools: null,
          allowedTools: null,
          requiresApprovalTools: null,
        }),
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
        spawnDepth: 3, // Already at depth 3, policy allows max 2
      };

      await expect(executor('nested-bot', {}, ctx)).rejects.toThrow(
        /spawn depth|exceeded/i
      );
    });

    it('should allow spawn when no policies exist', async () => {
      const { db } = await import('@baleyui/db');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'any-bot',
          balCode: 'bot { "tools": { "database_query" } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => null, // No policies
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
      };

      // Should not throw - no policies means no restrictions
      await expect(executor('any-bot', {}, ctx)).resolves.toBeDefined();
    });

    it('should enforce allowedTools whitelist', async () => {
      const { db } = await import('@baleyui/db');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'restricted-bot',
          balCode: 'bot { "tools": { "web_search", "database_query" } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => ({
          allowedTools: ['web_search'], // Only web_search allowed
          forbiddenTools: null,
          requiresApprovalTools: null,
        }),
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
      };

      await expect(executor('restricted-bot', {}, ctx)).rejects.toThrow(
        /not in allowed list.*database_query/i
      );
    });
  });

  describe('spawn result payload', () => {
    it('returns structured output plus a summary field', async () => {
      const { db } = await import('@baleyui/db');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'safe-bot',
          balCode: 'bot { "tools": { "web_search" } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => null,
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
      };

      const result = await executor('safe-bot', { task: 'analyze' }, ctx);

      // output now carries the child BB payload directly (mocked as "success")
      expect(result.output).toBe('success');
      // summary remains available for concise human-readable UX
      expect(result.summary).toContain('spawn_baleybot(safe-bot)');
    });
  });

  describe('robustness guards', () => {
    it('prefers system BaleyBots for internal callers to avoid name shadowing', async () => {
      const { db } = await import('@baleyui/db');
      const { executeBaleybot } = await import('../../executor');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValueOnce(
        mockBB({
          id: 'sys-bal-generator',
          name: 'bal_generator',
          balCode: 'system-bal-code',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => null,
      });

      await executor(
        'bal_generator',
        { task: 'build bot' },
        {
          workspaceId: 'user-workspace',
          baleybotId: 'parent',
          executionId: 'exec-1',
          userId: 'system',
        }
      );

      const firstCall = vi.mocked(executeBaleybot).mock.calls[0];
      expect(firstCall?.[0]).toBe('system-bal-code');
    });

    it('propagates _spawnOutputs into nested spawn contexts', async () => {
      const { db } = await import('@baleyui/db');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'safe-bot',
          balCode: 'bot { "tools": { } }',
        })
      );

      let capturedCtx: { _spawnOutputs?: Map<string, unknown> } | undefined;
      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => null,
        getTools: (ctx) => {
          capturedCtx = ctx;
          return new Map();
        },
      });

      const spawnOutputs = new Map<string, unknown>();

      await executor(
        'safe-bot',
        { task: 'delegate' },
        {
          workspaceId: 'ws-1',
          baleybotId: 'parent',
          executionId: 'exec-1',
          userId: 'user-1',
          _spawnOutputs: spawnOutputs,
        }
      );

      expect(capturedCtx?._spawnOutputs).toBe(spawnOutputs);
    });

    it('passes empty-string input when spawn input is undefined', async () => {
      const { db } = await import('@baleyui/db');
      const { executeBaleybot } = await import('../../executor');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'safe-bot',
          balCode: 'bot { "tools": { } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        getPolicies: async () => null,
      });

      await executor(
        'safe-bot',
        undefined,
        {
          workspaceId: 'ws-1',
          baleybotId: 'parent',
          executionId: 'exec-1',
          userId: 'user-1',
        }
      );

      const firstCall = vi.mocked(executeBaleybot).mock.calls[0];
      expect(firstCall?.[1]).toBe('');
    });
  });

  describe('spawn depth limit', () => {
    it('should prevent excessive spawn depth', async () => {
      const { db } = await import('@baleyui/db');

      vi.mocked(db.query.baleybots.findFirst).mockResolvedValue(
        mockBB({
          id: 'bb-1',
          name: 'deep-bot',
          balCode: 'bot { "tools": { } }',
        })
      );

      const executor = createSpawnBaleybotExecutor({
        maxSpawnDepth: 3,
        getPolicies: async () => null,
      });

      const ctx = {
        workspaceId: 'ws-1',
        baleybotId: 'parent',
        executionId: 'exec-1',
        userId: 'user-1',
        spawnDepth: 3, // Already at max depth
      };

      await expect(executor('deep-bot', {}, ctx)).rejects.toThrow(
        /maximum spawn depth/i
      );
    });
  });
});
