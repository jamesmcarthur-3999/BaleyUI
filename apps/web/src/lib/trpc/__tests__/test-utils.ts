import { vi, type Mock } from 'vitest';

/**
 * Mock workspace context for testing tRPC procedures.
 */
export interface MockContext {
  userId: string;
  workspace: {
    id: string;
    name: string;
    ownerId: string;
  };
  db: MockDb;
}

/**
 * Mock query result builder for Drizzle ORM patterns.
 */
export interface MockQueryBuilder<T> {
  findFirst: Mock<() => Promise<T | null>>;
  findMany: Mock<() => Promise<T[]>>;
}

/**
 * Mock database interface that mimics Drizzle ORM patterns.
 */
export interface MockDb {
  query: {
    baleybots: MockQueryBuilder<MockBaleybot>;
    baleybotExecutions: MockQueryBuilder<MockExecution>;
    flows: MockQueryBuilder<MockFlow>;
    flowExecutions: MockQueryBuilder<MockFlowExecution>;
    connections: MockQueryBuilder<MockConnection>;
    workspaces: MockQueryBuilder<MockWorkspace>;
    approvalPatterns: MockQueryBuilder<MockApprovalPattern>;
  };
  insert: Mock;
  update: Mock;
  delete: Mock;
  transaction: Mock<(fn: (tx: MockTransaction) => Promise<unknown>) => Promise<unknown>>;
}

/**
 * Mock transaction interface for database transactions.
 */
export interface MockTransaction {
  insert: Mock;
  update: Mock;
  delete: Mock;
  query: MockDb['query'];
}

/**
 * Mock BaleyBot entity.
 */
export interface MockBaleybot {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  status: 'draft' | 'active' | 'paused' | 'error';
  balCode: string;
  structure?: Record<string, unknown> | null;
  entityNames?: string[] | null;
  dependencies?: string[] | null;
  executionCount: number;
  lastExecutedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

/**
 * Mock execution entity.
 */
export interface MockExecution {
  id: string;
  baleybotId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input?: unknown;
  output?: unknown;
  error?: string | null;
  triggeredBy: 'manual' | 'schedule' | 'webhook' | 'other_bb';
  triggerSource?: string | null;
  segments?: unknown[] | null;
  durationMs?: number | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  baleybot?: MockBaleybot;
}

/**
 * Mock flow entity.
 */
export interface MockFlow {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  nodes: unknown[];
  edges: unknown[];
  triggers: unknown[];
  enabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

/**
 * Mock flow execution entity.
 */
export interface MockFlowExecution {
  id: string;
  flowId: string;
  flowVersion: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  triggeredBy: { type: string; userId?: string };
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  flow?: MockFlow;
}

/**
 * Mock connection entity.
 */
export interface MockConnection {
  id: string;
  workspaceId: string;
  type: 'openai' | 'anthropic' | 'ollama';
  name: string;
  config: {
    apiKey?: string;
    baseUrl?: string;
    organization?: string;
  };
  status: 'unconfigured' | 'connected' | 'error';
  isDefault: boolean;
  availableModels?: string[] | null;
  lastCheckedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

/**
 * Mock workspace entity.
 */
export interface MockWorkspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/**
 * Mock approval pattern entity.
 */
export interface MockApprovalPattern {
  id: string;
  workspaceId: string;
  tool: string;
  actionPattern: Record<string, unknown>;
  entityGoalPattern?: string | null;
  trustLevel: 'provisional' | 'trusted' | 'permanent';
  timesUsed: number;
  approvedBy: string;
  approvedAt: Date;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a mock database instance for testing.
 * All query methods are pre-configured as Vitest mocks.
 */
export function createMockDb(): MockDb {
  const createQueryBuilder = <T>(): MockQueryBuilder<T> => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
  });

  const createChainableMock = () => {
    const mock: Record<string, Mock> = {};
    mock.values = vi.fn().mockReturnValue(mock);
    mock.set = vi.fn().mockReturnValue(mock);
    mock.where = vi.fn().mockReturnValue(mock);
    mock.returning = vi.fn().mockResolvedValue([]);
    return mock;
  };

  const mockDb: MockDb = {
    query: {
      baleybots: createQueryBuilder<MockBaleybot>(),
      baleybotExecutions: createQueryBuilder<MockExecution>(),
      flows: createQueryBuilder<MockFlow>(),
      flowExecutions: createQueryBuilder<MockFlowExecution>(),
      connections: createQueryBuilder<MockConnection>(),
      workspaces: createQueryBuilder<MockWorkspace>(),
      approvalPatterns: createQueryBuilder<MockApprovalPattern>(),
    },
    insert: vi.fn().mockReturnValue(createChainableMock()),
    update: vi.fn().mockReturnValue(createChainableMock()),
    delete: vi.fn().mockReturnValue(createChainableMock()),
    transaction: vi.fn(async (fn) => {
      const tx: MockTransaction = {
        insert: vi.fn().mockReturnValue(createChainableMock()),
        update: vi.fn().mockReturnValue(createChainableMock()),
        delete: vi.fn().mockReturnValue(createChainableMock()),
        query: mockDb.query,
      };
      return fn(tx);
    }),
  };

  return mockDb;
}

/**
 * Create a mock workspace context for testing tRPC procedures.
 *
 * @param workspaceId - The workspace ID to use in the context.
 * @param userId - The user ID to use in the context.
 * @returns A mock context object with database mocks.
 */
export function createMockContext(
  workspaceId = 'test-workspace-id',
  userId = 'test-user-id'
): MockContext {
  return {
    userId,
    workspace: {
      id: workspaceId,
      name: 'Test Workspace',
      ownerId: userId,
    },
    db: createMockDb(),
  };
}

/**
 * Create a mock BaleyBot entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock BaleyBot entity.
 */
export function createMockBaleybot(overrides: Partial<MockBaleybot> = {}): MockBaleybot {
  return {
    id: 'test-baleybot-id',
    workspaceId: 'test-workspace-id',
    name: 'Test BaleyBot',
    description: 'A test BaleyBot',
    icon: null,
    status: 'draft',
    balCode: 'entity TestBot:\n  goal: "Test goal"\n  steps:\n    - return "Hello"',
    structure: null,
    entityNames: ['TestBot'],
    dependencies: null,
    executionCount: 0,
    lastExecutedAt: null,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    createdBy: 'test-user-id',
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

/**
 * Create a mock execution entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock execution entity.
 */
export function createMockExecution(overrides: Partial<MockExecution> = {}): MockExecution {
  return {
    id: 'test-execution-id',
    baleybotId: 'test-baleybot-id',
    status: 'completed',
    input: { test: 'input' },
    output: { test: 'output' },
    error: null,
    triggeredBy: 'manual',
    triggerSource: null,
    segments: null,
    durationMs: 100,
    startedAt: new Date('2025-01-01T00:00:00Z'),
    completedAt: new Date('2025-01-01T00:00:01Z'),
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock flow entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock flow entity.
 */
export function createMockFlow(overrides: Partial<MockFlow> = {}): MockFlow {
  return {
    id: 'test-flow-id',
    workspaceId: 'test-workspace-id',
    name: 'Test Flow',
    description: 'A test flow',
    nodes: [],
    edges: [],
    triggers: [],
    enabled: false,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

/**
 * Create a mock connection entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock connection entity.
 */
export function createMockConnection(overrides: Partial<MockConnection> = {}): MockConnection {
  return {
    id: 'test-connection-id',
    workspaceId: 'test-workspace-id',
    type: 'openai',
    name: 'Test Connection',
    config: {
      apiKey: 'encrypted-key',
    },
    status: 'connected',
    isDefault: true,
    availableModels: null,
    lastCheckedAt: null,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

/**
 * Create a mock approval pattern entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock approval pattern entity.
 */
export function createMockApprovalPattern(overrides: Partial<MockApprovalPattern> = {}): MockApprovalPattern {
  return {
    id: 'test-pattern-id',
    workspaceId: 'test-workspace-id',
    tool: 'http_request',
    actionPattern: { method: 'GET' },
    entityGoalPattern: null,
    trustLevel: 'provisional',
    timesUsed: 0,
    approvedBy: 'test-user-id',
    approvedAt: new Date('2025-01-01'),
    expiresAt: null,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}
