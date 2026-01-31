/**
 * Database Mock System
 *
 * Provides mock implementations of database operations for testing
 * without hitting a real database.
 */

import type {
  Workspace,
  Connection,
  Block,
  Tool,
  BlockExecution,
  ExecutionEvent,
} from '@baleyui/db/types';

// ============================================================================
// In-Memory Store
// ============================================================================

interface MockStore {
  workspaces: Map<string, Workspace>;
  connections: Map<string, Connection>;
  blocks: Map<string, Block>;
  tools: Map<string, Tool>;
  blockExecutions: Map<string, BlockExecution>;
  executionEvents: Map<string, ExecutionEvent[]>;
}

let store: MockStore = createEmptyStore();

function createEmptyStore(): MockStore {
  return {
    workspaces: new Map(),
    connections: new Map(),
    blocks: new Map(),
    tools: new Map(),
    blockExecutions: new Map(),
    executionEvents: new Map(),
  };
}

/**
 * Reset the mock store to empty state
 */
export function resetMockStore(): void {
  store = createEmptyStore();
}

/**
 * Seed the mock store with initial data
 */
export function seedMockStore(data: Partial<{
  workspaces: Workspace[];
  connections: Connection[];
  blocks: Block[];
  tools: Tool[];
}>): void {
  if (data.workspaces) {
    for (const workspace of data.workspaces) {
      store.workspaces.set(workspace.id, workspace);
    }
  }
  if (data.connections) {
    for (const connection of data.connections) {
      store.connections.set(connection.id, connection);
    }
  }
  if (data.blocks) {
    for (const block of data.blocks) {
      store.blocks.set(block.id, block);
    }
  }
  if (data.tools) {
    for (const tool of data.tools) {
      store.tools.set(tool.id, tool);
    }
  }
}

// ============================================================================
// Mock Database Client
// ============================================================================

export const mockDb = {
  // Workspaces
  workspaces: {
    findFirst: async (
      opts: { where: (w: Workspace) => boolean }
    ): Promise<Workspace | undefined> => {
      return Array.from(store.workspaces.values()).find((w) =>
        opts.where(w)
      );
    },
    findMany: async (
      opts?: { where?: (w: Workspace) => boolean }
    ): Promise<Workspace[]> => {
      const all = Array.from(store.workspaces.values());
      return opts?.where ? all.filter(opts.where) : all;
    },
    create: async (data: Omit<Workspace, 'id'>): Promise<Workspace> => {
      const id = crypto.randomUUID();
      const workspace = { ...data, id } as Workspace;
      store.workspaces.set(id, workspace);
      return workspace;
    },
    update: async (
      id: string,
      data: Partial<Workspace>
    ): Promise<Workspace> => {
      const existing = store.workspaces.get(id);
      if (!existing) throw new Error(`Workspace ${id} not found`);
      const updated = { ...existing, ...data };
      store.workspaces.set(id, updated);
      return updated;
    },
    delete: async (id: string): Promise<void> => {
      store.workspaces.delete(id);
    },
  },

  // Connections
  connections: {
    findFirst: async (
      opts: { where: (c: Connection) => boolean }
    ): Promise<Connection | undefined> => {
      return Array.from(store.connections.values()).find((c) =>
        opts.where(c)
      );
    },
    findMany: async (
      opts?: { where?: (c: Connection) => boolean }
    ): Promise<Connection[]> => {
      const all = Array.from(store.connections.values());
      return opts?.where ? all.filter(opts.where) : all;
    },
    create: async (data: Omit<Connection, 'id'>): Promise<Connection> => {
      const id = crypto.randomUUID();
      const connection = { ...data, id } as Connection;
      store.connections.set(id, connection);
      return connection;
    },
    update: async (
      id: string,
      data: Partial<Connection>
    ): Promise<Connection> => {
      const existing = store.connections.get(id);
      if (!existing) throw new Error(`Connection ${id} not found`);
      const updated = { ...existing, ...data };
      store.connections.set(id, updated);
      return updated;
    },
    delete: async (id: string): Promise<void> => {
      store.connections.delete(id);
    },
  },

  // Blocks
  blocks: {
    findFirst: async (
      opts: { where: (b: Block) => boolean }
    ): Promise<Block | undefined> => {
      return Array.from(store.blocks.values()).find((b) => opts.where(b));
    },
    findMany: async (
      opts?: { where?: (b: Block) => boolean }
    ): Promise<Block[]> => {
      const all = Array.from(store.blocks.values());
      return opts?.where ? all.filter(opts.where) : all;
    },
    create: async (data: Omit<Block, 'id'>): Promise<Block> => {
      const id = crypto.randomUUID();
      const block = { ...data, id } as Block;
      store.blocks.set(id, block);
      return block;
    },
    update: async (id: string, data: Partial<Block>): Promise<Block> => {
      const existing = store.blocks.get(id);
      if (!existing) throw new Error(`Block ${id} not found`);
      const updated = { ...existing, ...data };
      store.blocks.set(id, updated);
      return updated;
    },
    delete: async (id: string): Promise<void> => {
      store.blocks.delete(id);
    },
  },

  // Tools
  tools: {
    findFirst: async (
      opts: { where: (t: Tool) => boolean }
    ): Promise<Tool | undefined> => {
      return Array.from(store.tools.values()).find((t) => opts.where(t));
    },
    findMany: async (
      opts?: { where?: (t: Tool) => boolean }
    ): Promise<Tool[]> => {
      const all = Array.from(store.tools.values());
      return opts?.where ? all.filter(opts.where) : all;
    },
    create: async (data: Omit<Tool, 'id'>): Promise<Tool> => {
      const id = crypto.randomUUID();
      const tool = { ...data, id } as Tool;
      store.tools.set(id, tool);
      return tool;
    },
    update: async (id: string, data: Partial<Tool>): Promise<Tool> => {
      const existing = store.tools.get(id);
      if (!existing) throw new Error(`Tool ${id} not found`);
      const updated = { ...existing, ...data };
      store.tools.set(id, updated);
      return updated;
    },
    delete: async (id: string): Promise<void> => {
      store.tools.delete(id);
    },
  },

  // Block Executions
  blockExecutions: {
    findFirst: async (
      opts: { where: (e: BlockExecution) => boolean }
    ): Promise<BlockExecution | undefined> => {
      return Array.from(store.blockExecutions.values()).find((e) =>
        opts.where(e)
      );
    },
    findMany: async (
      opts?: { where?: (e: BlockExecution) => boolean }
    ): Promise<BlockExecution[]> => {
      const all = Array.from(store.blockExecutions.values());
      return opts?.where ? all.filter(opts.where) : all;
    },
    create: async (
      data: Omit<BlockExecution, 'id'>
    ): Promise<BlockExecution> => {
      const id = crypto.randomUUID();
      const execution = { ...data, id } as BlockExecution;
      store.blockExecutions.set(id, execution);
      store.executionEvents.set(id, []);
      return execution;
    },
    update: async (
      id: string,
      data: Partial<BlockExecution>
    ): Promise<BlockExecution> => {
      const existing = store.blockExecutions.get(id);
      if (!existing) throw new Error(`BlockExecution ${id} not found`);
      const updated = { ...existing, ...data };
      store.blockExecutions.set(id, updated);
      return updated;
    },
  },

  // Execution Events
  executionEvents: {
    create: async (
      executionId: string,
      event: Omit<ExecutionEvent, 'id' | 'executionId'>
    ): Promise<ExecutionEvent> => {
      const events = store.executionEvents.get(executionId) ?? [];
      const newEvent = {
        ...event,
        id: crypto.randomUUID(),
        executionId,
      } as ExecutionEvent;
      events.push(newEvent);
      store.executionEvents.set(executionId, events);
      return newEvent;
    },
    findMany: async (
      executionId: string,
      opts?: { fromIndex?: number }
    ): Promise<ExecutionEvent[]> => {
      const events = store.executionEvents.get(executionId) ?? [];
      if (opts?.fromIndex !== undefined) {
        return events.filter((e) => e.index >= opts.fromIndex!);
      }
      return events;
    },
  },

};

// Type for the mock database
export type MockDb = typeof mockDb;

// Transaction helper (separate to avoid circular reference)
export async function mockTransaction<T>(fn: (tx: MockDb) => Promise<T>): Promise<T> {
  // In mock, transactions just execute normally
  // Could add rollback support if needed
  return fn(mockDb);
}
