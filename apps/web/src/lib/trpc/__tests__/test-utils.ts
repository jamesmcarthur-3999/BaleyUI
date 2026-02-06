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
    apiKeys: MockQueryBuilder<MockApiKey>;
    webhookLogs: MockQueryBuilder<MockWebhookLog>;
    workspacePolicies: MockQueryBuilder<MockWorkspacePolicy>;
    baleybotTriggers: MockQueryBuilder<MockBaleybotTrigger>;
    notifications: MockQueryBuilder<MockNotification>;
    baleybotMemory: MockQueryBuilder<MockMemoryEntry>;
    scheduledTasks: MockQueryBuilder<MockScheduledTask>;
    tools: MockQueryBuilder<MockTool>;
    blocks: MockQueryBuilder<MockBlock>;
  };
  insert: Mock;
  update: Mock;
  delete: Mock;
  select: Mock;
  transaction: Mock<(fn: (tx: MockTransaction) => Promise<unknown>) => Promise<unknown>>;
}

/**
 * Mock transaction interface for database transactions.
 */
export interface MockTransaction {
  insert: Mock;
  update: Mock;
  delete: Mock;
  select: Mock;
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
 * Mock API key entity.
 */
export interface MockApiKey {
  id: string;
  workspaceId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  keySuffix: string;
  permissions: string[];
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mock webhook log entity.
 */
export interface MockWebhookLog {
  id: string;
  flowId: string;
  status: 'success' | 'error';
  method: string;
  headers?: Record<string, string> | null;
  body?: unknown;
  responseStatus?: number | null;
  error?: string | null;
  executionId?: string | null;
  createdAt: Date;
  execution?: {
    id: string;
    status: string;
    completedAt?: Date | null;
  } | null;
}

/**
 * Mock workspace policy entity.
 */
export interface MockWorkspacePolicy {
  id: string;
  workspaceId: string;
  allowedTools?: string[] | null;
  forbiddenTools?: string[] | null;
  requiresApprovalTools?: string[] | null;
  maxAutoApproveAmount?: number | null;
  reapprovalIntervalDays: number;
  maxAutoFiresBeforeReview: number;
  learningManual?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
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
 * Mock BaleyBot trigger entity.
 */
export interface MockBaleybotTrigger {
  id: string;
  workspaceId: string;
  sourceBaleybotId: string;
  targetBaleybotId: string;
  triggerType: 'completion' | 'success' | 'failure';
  inputMapping?: Record<string, string> | null;
  staticInput?: Record<string, unknown> | null;
  condition?: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  sourceBaleybot?: { id: string; name: string };
  targetBaleybot?: { id: string; name: string };
}

/**
 * Mock notification entity.
 */
export interface MockNotification {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  body?: string | null;
  type: 'info' | 'success' | 'warning' | 'error';
  source?: string | null;
  sourceId?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}

/**
 * Mock memory entry entity.
 */
export interface MockMemoryEntry {
  id: string;
  workspaceId: string;
  baleybotId: string;
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mock scheduled task entity.
 */
export interface MockScheduledTask {
  id: string;
  workspaceId: string;
  baleybotId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input?: unknown;
  runAt: Date;
  executionId?: string | null;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
  baleybot?: { id: string; name: string; icon?: string | null };
}

/**
 * Mock tool entity.
 */
export interface MockTool {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  code: string;
  connectionId?: string | null;
  isGenerated: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

/**
 * Mock block entity.
 */
export interface MockBlock {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  description?: string | null;
  model?: string | null;
  code?: string | null;
  generatedCode?: string | null;
  codeGeneratedAt?: Date | null;
  codeAccuracy?: string | null;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: string | null;
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
    mock.onConflictDoNothing = vi.fn().mockReturnValue(mock);
    mock.from = vi.fn().mockReturnValue(mock);
    mock.innerJoin = vi.fn().mockReturnValue(mock);
    mock.leftJoin = vi.fn().mockReturnValue(mock);
    mock.orderBy = vi.fn().mockReturnValue(mock);
    mock.limit = vi.fn().mockReturnValue(mock);
    mock.groupBy = vi.fn().mockReturnValue(mock);
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
      apiKeys: createQueryBuilder<MockApiKey>(),
      webhookLogs: createQueryBuilder<MockWebhookLog>(),
      workspacePolicies: createQueryBuilder<MockWorkspacePolicy>(),
      baleybotTriggers: createQueryBuilder<MockBaleybotTrigger>(),
      notifications: createQueryBuilder<MockNotification>(),
      baleybotMemory: createQueryBuilder<MockMemoryEntry>(),
      scheduledTasks: createQueryBuilder<MockScheduledTask>(),
      tools: createQueryBuilder<MockTool>(),
      blocks: createQueryBuilder<MockBlock>(),
    },
    insert: vi.fn().mockReturnValue(createChainableMock()),
    update: vi.fn().mockReturnValue(createChainableMock()),
    delete: vi.fn().mockReturnValue(createChainableMock()),
    select: vi.fn().mockReturnValue(createChainableMock()),
    transaction: vi.fn(async (fn) => {
      const tx: MockTransaction = {
        insert: vi.fn().mockReturnValue(createChainableMock()),
        update: vi.fn().mockReturnValue(createChainableMock()),
        delete: vi.fn().mockReturnValue(createChainableMock()),
        select: vi.fn().mockReturnValue(createChainableMock()),
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

/**
 * Create a mock API key entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock API key entity.
 */
export function createMockApiKey(overrides: Partial<MockApiKey> = {}): MockApiKey {
  return {
    id: 'test-api-key-id',
    workspaceId: 'test-workspace-id',
    name: 'Test API Key',
    keyHash: 'abc123hash',
    keyPrefix: 'bui_live_abc',
    keySuffix: 'ef01',
    permissions: ['read', 'execute'],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdBy: 'test-user-id',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock webhook log entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock webhook log entity.
 */
export function createMockWebhookLog(overrides: Partial<MockWebhookLog> = {}): MockWebhookLog {
  return {
    id: 'test-webhook-log-id',
    flowId: 'test-flow-id',
    status: 'success',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { test: true },
    responseStatus: 200,
    error: null,
    executionId: 'test-execution-id',
    createdAt: new Date('2025-01-01'),
    execution: null,
    ...overrides,
  };
}

/**
 * Create a mock workspace policy entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock workspace policy entity.
 */
export function createMockWorkspacePolicy(overrides: Partial<MockWorkspacePolicy> = {}): MockWorkspacePolicy {
  return {
    id: 'test-policy-id',
    workspaceId: 'test-workspace-id',
    allowedTools: null,
    forbiddenTools: null,
    requiresApprovalTools: null,
    maxAutoApproveAmount: null,
    reapprovalIntervalDays: 90,
    maxAutoFiresBeforeReview: 100,
    learningManual: null,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock BaleyBot trigger entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock trigger entity.
 */
export function createMockTrigger(overrides: Partial<MockBaleybotTrigger> = {}): MockBaleybotTrigger {
  return {
    id: 'test-trigger-id',
    workspaceId: 'test-workspace-id',
    sourceBaleybotId: 'source-bb-id',
    targetBaleybotId: 'target-bb-id',
    triggerType: 'completion',
    inputMapping: null,
    staticInput: null,
    condition: null,
    enabled: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock notification entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock notification entity.
 */
export function createMockNotification(overrides: Partial<MockNotification> = {}): MockNotification {
  return {
    id: 'test-notification-id',
    workspaceId: 'test-workspace-id',
    userId: 'test-user-id',
    title: 'Test Notification',
    body: 'Test notification body',
    type: 'info',
    source: null,
    sourceId: null,
    readAt: null,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock memory entry entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock memory entry entity.
 */
export function createMockMemoryEntry(overrides: Partial<MockMemoryEntry> = {}): MockMemoryEntry {
  return {
    id: 'test-memory-id',
    workspaceId: 'test-workspace-id',
    baleybotId: 'test-baleybot-id',
    key: 'test-key',
    value: 'test-value',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock scheduled task entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock scheduled task entity.
 */
export function createMockScheduledTask(overrides: Partial<MockScheduledTask> = {}): MockScheduledTask {
  return {
    id: 'test-task-id',
    workspaceId: 'test-workspace-id',
    baleybotId: 'test-baleybot-id',
    status: 'pending',
    input: { message: 'scheduled input' },
    runAt: new Date('2025-02-01'),
    executionId: null,
    error: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Create a mock tool entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock tool entity.
 */
export function createMockTool(overrides: Partial<MockTool> = {}): MockTool {
  return {
    id: 'test-tool-id',
    workspaceId: 'test-workspace-id',
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: { type: 'object', properties: {} },
    code: 'return { result: true };',
    connectionId: null,
    isGenerated: false,
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

/**
 * Create a mock block entity for testing.
 *
 * @param overrides - Fields to override on the default mock.
 * @returns A mock block entity.
 */
export function createMockBlock(overrides: Partial<MockBlock> = {}): MockBlock {
  return {
    id: 'test-block-id',
    workspaceId: 'test-workspace-id',
    name: 'Test Block',
    type: 'decision',
    description: 'A test block',
    model: 'anthropic:claude-sonnet-4-20250514',
    code: null,
    generatedCode: null,
    codeGeneratedAt: null,
    codeAccuracy: null,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    version: 1,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}
