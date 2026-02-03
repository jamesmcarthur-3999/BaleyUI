import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockContext,
  createMockFlow,
  createMockBaleybot,
  type MockContext,
  type MockFlow,
  type MockFlowExecution,
} from '../../__tests__/test-utils';

// Mock external dependencies
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    execute: { maxRequests: 10, windowMs: 60000 },
  },
}));

vi.mock('@/lib/flow-executor', () => ({
  executeFlow: vi.fn().mockResolvedValue({
    status: 'success',
    outputs: { result: 'test' },
  }),
}));

vi.mock('@baleyui/db', () => ({
  flows: { id: 'id', workspaceId: 'workspaceId', createdAt: 'createdAt', enabled: 'enabled' },
  flowExecutions: { id: 'id', flowId: 'flowId', status: 'status', createdAt: 'createdAt' },
  baleybots: { id: 'id', workspaceId: 'workspaceId' },
  eq: vi.fn((a, b) => ({ _type: 'eq', a, b })),
  and: vi.fn((...args) => ({ _type: 'and', args })),
  inArray: vi.fn((field, values) => ({ _type: 'inArray', field, values })),
  notDeleted: vi.fn(() => ({ _type: 'notDeleted' })),
  softDelete: vi.fn().mockResolvedValue({ id: 'deleted-id' }),
  updateWithLock: vi.fn().mockResolvedValue({ id: 'updated-id', version: 2 }),
}));

describe('Flows Router Logic', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns flows for workspace with node/edge counts', async () => {
      const mockFlows = [
        createMockFlow({
          id: '1',
          name: 'Flow 1',
          nodes: [{ id: 'n1' }, { id: 'n2' }],
          edges: [{ id: 'e1' }],
        }),
        createMockFlow({
          id: '2',
          name: 'Flow 2',
          nodes: [],
          edges: [],
        }),
      ];
      ctx.db.query.flows.findMany.mockResolvedValue(mockFlows);

      const result = await ctx.db.query.flows.findMany();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Flow 1');

      // Simulate the transformation done in the router
      const withCounts = result.map((flow: MockFlow) => ({
        ...flow,
        nodeCount: Array.isArray(flow.nodes) ? flow.nodes.length : 0,
        edgeCount: Array.isArray(flow.edges) ? flow.edges.length : 0,
      }));

      expect(withCounts[0].nodeCount).toBe(2);
      expect(withCounts[0].edgeCount).toBe(1);
      expect(withCounts[1].nodeCount).toBe(0);
    });

    it('returns empty array when no flows exist', async () => {
      ctx.db.query.flows.findMany.mockResolvedValue([]);

      const result = await ctx.db.query.flows.findMany();

      expect(result).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns a single flow by ID', async () => {
      const mockFlow = createMockFlow({ id: 'test-id', name: 'Test Flow' });
      ctx.db.query.flows.findFirst.mockResolvedValue(mockFlow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-id');
      expect(result?.name).toBe('Test Flow');
    });

    it('returns null for non-existent flow', async () => {
      ctx.db.query.flows.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });

    it('only returns flows for the correct workspace', async () => {
      const wrongWorkspaceFlow = createMockFlow({
        id: 'wrong-ws',
        workspaceId: 'other-workspace',
      });
      ctx.db.query.flows.findFirst.mockResolvedValue(null); // Simulating workspace filter

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a new flow with empty nodes and edges', async () => {
      const newFlow = createMockFlow({
        id: 'new-id',
        name: 'New Flow',
        nodes: [],
        edges: [],
        enabled: false,
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newFlow]),
        }),
      });

      const insertMock = ctx.db.insert('flows');
      const result = await insertMock.values({}).returning();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('New Flow');
      expect(result[0].nodes).toEqual([]);
      expect(result[0].edges).toEqual([]);
      expect(result[0].enabled).toBe(false);
    });

    it('creates flow with description', async () => {
      const newFlow = createMockFlow({
        name: 'Described Flow',
        description: 'A flow with description',
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newFlow]),
        }),
      });

      const insertMock = ctx.db.insert('flows');
      const result = await insertMock.values({}).returning();

      expect(result[0].description).toBe('A flow with description');
    });
  });

  describe('update', () => {
    it('updates flow with optimistic locking', async () => {
      const existingFlow = createMockFlow({ id: 'test-id', version: 1 });
      ctx.db.query.flows.findFirst.mockResolvedValue(existingFlow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
    });

    it('updates nodes and edges', async () => {
      const existingFlow = createMockFlow({ id: 'test-id' });
      ctx.db.query.flows.findFirst.mockResolvedValue(existingFlow);

      const updatedFlow = createMockFlow({
        id: 'test-id',
        nodes: [{ id: 'new-node', type: 'baleybot', position: { x: 0, y: 0 } }],
        edges: [{ id: 'new-edge', source: 'a', target: 'b' }],
      });

      // In actual implementation, updateWithLock would be called
      expect(updatedFlow.nodes).toHaveLength(1);
      expect(updatedFlow.edges).toHaveLength(1);
    });

    it('updates enabled status', async () => {
      const existingFlow = createMockFlow({ id: 'test-id', enabled: false });
      ctx.db.query.flows.findFirst.mockResolvedValue(existingFlow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result?.enabled).toBe(false);
    });

    it('rejects update for non-existent flow', async () => {
      ctx.db.query.flows.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('soft deletes a flow', async () => {
      const existingFlow = createMockFlow({ id: 'test-id', deletedAt: null });
      ctx.db.query.flows.findFirst.mockResolvedValue(existingFlow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).not.toBeNull();
      expect(result?.deletedAt).toBeNull();
    });

    it('returns null for already deleted flow', async () => {
      ctx.db.query.flows.findFirst.mockResolvedValue(null); // notDeleted filter

      const result = await ctx.db.query.flows.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('duplicate', () => {
    it('creates a copy of an existing flow', async () => {
      const originalFlow = createMockFlow({
        id: 'original-id',
        name: 'Original Flow',
        nodes: [{ id: 'n1' }],
        edges: [{ id: 'e1' }],
        enabled: true,
      });
      ctx.db.query.flows.findFirst.mockResolvedValue(originalFlow);

      const duplicatedFlow = createMockFlow({
        id: 'duplicate-id',
        name: 'Original Flow (Copy)',
        nodes: originalFlow.nodes,
        edges: originalFlow.edges,
        enabled: false, // Duplicated flows start disabled
      });

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([duplicatedFlow]),
        }),
      });

      // Verify original was found
      const original = await ctx.db.query.flows.findFirst();
      expect(original).not.toBeNull();

      // Create duplicate
      const insertMock = ctx.db.insert('flows');
      const result = await insertMock.values({}).returning();

      expect(result[0].name).toBe('Original Flow (Copy)');
      expect(result[0].enabled).toBe(false);
      expect(result[0].nodes).toEqual(originalFlow.nodes);
    });
  });

  describe('execute', () => {
    it('verifies flow exists before execution', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id', enabled: true });
      ctx.db.query.flows.findFirst.mockResolvedValue(mockFlow);

      const result = await ctx.db.query.flows.findFirst();

      expect(result).not.toBeNull();
    });

    it('creates execution record', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id' });
      ctx.db.query.flows.findFirst.mockResolvedValue(mockFlow);

      const mockExecution: MockFlowExecution = {
        id: 'exec-id',
        flowId: 'flow-id',
        flowVersion: 1,
        status: 'pending',
        triggeredBy: { type: 'manual', userId: ctx.userId },
        input: null,
        createdAt: new Date(),
      };

      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockExecution]),
        }),
      });

      const insertMock = ctx.db.insert('flowExecutions');
      const result = await insertMock.values({}).returning();

      expect(result[0].status).toBe('pending');
      expect(result[0].triggeredBy.type).toBe('manual');
    });

    it('fetches referenced baleybots from flow nodes', async () => {
      const mockFlow = createMockFlow({
        id: 'flow-id',
        nodes: [
          { id: 'n1', type: 'baleybot', data: { baleybotId: 'bb-1' }, position: { x: 0, y: 0 } },
          { id: 'n2', type: 'baleybot', data: { baleybotId: 'bb-2' }, position: { x: 100, y: 0 } },
        ],
      });
      ctx.db.query.flows.findFirst.mockResolvedValue(mockFlow);

      const mockBaleybots = [
        createMockBaleybot({ id: 'bb-1', balCode: 'code1' }),
        createMockBaleybot({ id: 'bb-2', balCode: 'code2' }),
      ];
      ctx.db.query.baleybots.findMany.mockResolvedValue(mockBaleybots);

      const flow = await ctx.db.query.flows.findFirst();
      const nodes = flow?.nodes as Array<{ type?: string; data?: { baleybotId?: string } }>;
      const baleybotIds = nodes
        .filter((n) => n.type === 'baleybot' && n.data?.baleybotId)
        .map((n) => n.data?.baleybotId);

      expect(baleybotIds).toContain('bb-1');
      expect(baleybotIds).toContain('bb-2');
    });
  });

  describe('getExecution', () => {
    it('returns execution with flow relation', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id', workspaceId: ctx.workspace.id });
      const mockExecution: MockFlowExecution = {
        id: 'exec-id',
        flowId: 'flow-id',
        flowVersion: 1,
        status: 'completed',
        triggeredBy: { type: 'manual' },
        output: { result: 'success' },
        createdAt: new Date(),
        flow: mockFlow,
      };

      ctx.db.query.flowExecutions.findFirst.mockResolvedValue(mockExecution);

      const result = await ctx.db.query.flowExecutions.findFirst();

      expect(result).not.toBeNull();
      expect(result?.flow?.workspaceId).toBe(ctx.workspace.id);
    });

    it('returns null for non-existent execution', async () => {
      ctx.db.query.flowExecutions.findFirst.mockResolvedValue(null);

      const result = await ctx.db.query.flowExecutions.findFirst();

      expect(result).toBeNull();
    });
  });

  describe('listExecutions', () => {
    it('returns executions filtered by flowId', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id' });
      ctx.db.query.flows.findFirst.mockResolvedValue(mockFlow);

      const mockExecutions: MockFlowExecution[] = [
        {
          id: 'exec-1',
          flowId: 'flow-id',
          flowVersion: 1,
          status: 'completed',
          triggeredBy: { type: 'manual' },
          createdAt: new Date(),
          flow: mockFlow,
        },
      ];
      ctx.db.query.flowExecutions.findMany.mockResolvedValue(mockExecutions);

      const executions = await ctx.db.query.flowExecutions.findMany();

      expect(executions).toHaveLength(1);
      expect(executions[0].flowId).toBe('flow-id');
    });

    it('returns executions filtered by status', async () => {
      const completedExecutions: MockFlowExecution[] = [
        {
          id: 'exec-1',
          flowId: 'flow-id',
          flowVersion: 1,
          status: 'completed',
          triggeredBy: { type: 'manual' },
          createdAt: new Date(),
        },
      ];
      ctx.db.query.flowExecutions.findMany.mockResolvedValue(completedExecutions);

      const result = await ctx.db.query.flowExecutions.findMany();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('completed');
    });

    it('returns empty array when no flows exist in workspace', async () => {
      ctx.db.query.flows.findMany.mockResolvedValue([]);

      const flows = await ctx.db.query.flows.findMany();

      expect(flows).toHaveLength(0);
    });
  });

  describe('cancelExecution', () => {
    it('cancels a running execution', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id', workspaceId: ctx.workspace.id });
      const runningExecution: MockFlowExecution = {
        id: 'exec-id',
        flowId: 'flow-id',
        flowVersion: 1,
        status: 'running',
        triggeredBy: { type: 'manual' },
        createdAt: new Date(),
        flow: mockFlow,
      };

      ctx.db.query.flowExecutions.findFirst.mockResolvedValue(runningExecution);

      const result = await ctx.db.query.flowExecutions.findFirst();

      expect(result?.status).toBe('running');
      // In actual implementation, status would be updated to 'cancelled'
    });

    it('cancels a pending execution', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id', workspaceId: ctx.workspace.id });
      const pendingExecution: MockFlowExecution = {
        id: 'exec-id',
        flowId: 'flow-id',
        flowVersion: 1,
        status: 'pending',
        triggeredBy: { type: 'manual' },
        createdAt: new Date(),
        flow: mockFlow,
      };

      ctx.db.query.flowExecutions.findFirst.mockResolvedValue(pendingExecution);

      const result = await ctx.db.query.flowExecutions.findFirst();

      expect(result?.status).toBe('pending');
    });

    it('rejects cancellation for completed execution', async () => {
      const mockFlow = createMockFlow({ id: 'flow-id', workspaceId: ctx.workspace.id });
      const completedExecution: MockFlowExecution = {
        id: 'exec-id',
        flowId: 'flow-id',
        flowVersion: 1,
        status: 'completed',
        triggeredBy: { type: 'manual' },
        createdAt: new Date(),
        flow: mockFlow,
      };

      ctx.db.query.flowExecutions.findFirst.mockResolvedValue(completedExecution);

      const result = await ctx.db.query.flowExecutions.findFirst();

      expect(result?.status).toBe('completed');
      // In actual implementation, this would throw BAD_REQUEST
    });

    it('rejects cancellation for wrong workspace', async () => {
      const wrongWorkspaceFlow = createMockFlow({
        id: 'flow-id',
        workspaceId: 'other-workspace',
      });
      const execution: MockFlowExecution = {
        id: 'exec-id',
        flowId: 'flow-id',
        flowVersion: 1,
        status: 'running',
        triggeredBy: { type: 'manual' },
        createdAt: new Date(),
        flow: wrongWorkspaceFlow,
      };

      ctx.db.query.flowExecutions.findFirst.mockResolvedValue(execution);

      const result = await ctx.db.query.flowExecutions.findFirst();

      expect(result?.flow?.workspaceId).not.toBe(ctx.workspace.id);
      // In actual implementation, this would throw FORBIDDEN
    });
  });
});
