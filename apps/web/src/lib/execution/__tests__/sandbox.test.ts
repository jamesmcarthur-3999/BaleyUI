/**
 * Sandboxing Security Tests
 *
 * Tests for the isolated-vm sandboxing in function-block.ts
 * Verifies that malicious code cannot escape the sandbox.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('@baleyui/db', () => ({
  db: {
    query: {
      blocks: {
        findFirst: vi.fn(),
      },
    },
  },
  blocks: {
    id: 'id',
  },
  eq: vi.fn(),
}));

// Mock @baleybots/core
vi.mock('@baleybots/core', () => ({
  Deterministic: {
    create: vi.fn(({ processFn }) => ({
      process: async (input: unknown) => processFn(input),
    })),
  },
}));

// Import after mocks
import { functionBlockExecutor } from '../node-executors/function-block';
import type { CompiledNode, NodeExecutorContext } from '../node-executors/index';

/**
 * Create a mock block object for database query result.
 * Uses `as unknown as` to bypass strict typing on mock data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockBlock(data: { id: string; name: string; code: string | null }): any {
  return data;
}

// Helper to create mock compiled node
function createMockNode(blockId: string): CompiledNode {
  return {
    nodeId: 'test-node-1',
    type: 'function-block',
    data: { blockId },
    incomingEdges: [],
    outgoingEdges: [],
  } as unknown as CompiledNode;
}

// Helper to create mock context
function createMockContext(): NodeExecutorContext {
  return {
    flowId: 'flow-1',
    executionId: 'exec-1',
    workspaceId: 'ws-1',
    nodeResults: new Map(),
    flowInput: {},
    signal: new AbortController().signal,
  };
}

describe('Function Block Sandboxing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid code execution', () => {
    it('should execute simple return value', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return input * 2;',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();
      const result = await functionBlockExecutor.execute(node, 5, ctx);

      expect(result).toBe(10);
    });

    it('should execute string operations', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return input.toUpperCase();',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();
      const result = await functionBlockExecutor.execute(node, 'hello', ctx);

      expect(result).toBe('HELLO');
    });

    it('should execute boolean logic', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return input > 10 && input < 20;',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();
      const result = await functionBlockExecutor.execute(node, 15, ctx);

      expect(result).toBe(true);
    });

    it('should allow Math operations', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return Math.floor(input) + Math.ceil(input);',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();
      const result = await functionBlockExecutor.execute(node, 2.5, ctx);

      expect(result).toBe(5); // floor(2.5) + ceil(2.5) = 2 + 3
    });
  });

  describe('security: blocks access to process', () => {
    it('should throw when accessing process.env', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return process.env.SECRET;',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });

    it('should throw when accessing process.exit', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'process.exit(1); return input;',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });
  });

  describe('security: blocks access to require', () => {
    it('should throw when using require', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: "const fs = require('fs'); return fs.readFileSync('/etc/passwd');",
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });

    it('should throw when using import()', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: "const fs = await import('fs'); return true;",
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });
  });

  describe('security: blocks prototype pollution', () => {
    it('should not allow modifying Object.prototype', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'Object.prototype.polluted = true; return { check: ({}).polluted };',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      // The sandbox should either throw or not pollute the main prototype
      try {
        await functionBlockExecutor.execute(node, {}, ctx);
        // If it executes, verify the main process wasn't polluted
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((Object.prototype as any).polluted).toBeUndefined();
      } catch {
        // Throwing is also acceptable behavior
      }

      // Verify main prototype is clean
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('should not allow modifying Array.prototype', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'Array.prototype.malicious = () => "hacked"; return [].malicious?.();',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      try {
        await functionBlockExecutor.execute(node, {}, ctx);
      } catch {
        // Throwing is acceptable
      }

      // Verify main prototype is clean
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((Array.prototype as any).malicious).toBeUndefined();
    });
  });

  describe('security: blocks constructor escape attempts', () => {
    it('should block Function constructor escape', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: "const fn = new Function('return process'); return fn();",
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });

    it('should block eval()', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: "return eval('process.env');",
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });

    it('should block __proto__ manipulation', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'const obj = {}; obj.__proto__.hacked = true; return {};',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      try {
        await functionBlockExecutor.execute(node, {}, ctx);
      } catch {
        // Throwing is acceptable
      }

      // Verify main prototype is clean
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((Object.prototype as any).hacked).toBeUndefined();
    });
  });

  describe('resource limits', () => {
    it('should throw on syntax errors', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return {{{ invalid syntax',
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(functionBlockExecutor.execute(node, {}, ctx)).rejects.toThrow();
    });

    it('should handle undefined return gracefully', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'const x = input;', // No explicit return
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();
      const result = await functionBlockExecutor.execute(node, 'test', ctx);

      expect(result).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should throw when block not found', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(undefined);

      const node = createMockNode('nonexistent-block');
      const ctx = createMockContext();

      await expect(
        functionBlockExecutor.execute(node, {}, ctx)
      ).rejects.toThrow(/Block not found/);
    });

    it('should throw when block has no code', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: null,
        })
      );

      const node = createMockNode('block-1');
      const ctx = createMockContext();

      await expect(
        functionBlockExecutor.execute(node, {}, ctx)
      ).rejects.toThrow(/No code defined/);
    });

    it('should throw when execution is cancelled', async () => {
      const { db } = await import('@baleyui/db');
      vi.mocked(db.query.blocks.findFirst).mockResolvedValue(
        mockBlock({
          id: 'block-1',
          name: 'test-block',
          code: 'return input;',
        })
      );

      const node = createMockNode('block-1');
      const abortController = new AbortController();
      abortController.abort();

      const ctx: NodeExecutorContext = {
        flowId: 'flow-1',
        executionId: 'exec-1',
        workspaceId: 'ws-1',
        nodeResults: new Map(),
        flowInput: {},
        signal: abortController.signal,
      };

      await expect(
        functionBlockExecutor.execute(node, {}, ctx)
      ).rejects.toThrow(/cancelled/i);
    });
  });
});
