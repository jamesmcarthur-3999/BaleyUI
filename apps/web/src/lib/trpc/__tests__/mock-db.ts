import { vi } from 'vitest';

/**
 * Table column refs used across all tRPC router tests.
 * Each value is a simple string placeholder for mock matching.
 */
const TABLE_SCHEMAS = {
  baleybots: {
    id: 'id',
    workspaceId: 'workspaceId',
    name: 'name',
    isInternal: 'isInternal',
    balCode: 'balCode',
    adminEdited: 'adminEdited',
    status: 'status',
    version: 'version',
    createdAt: 'createdAt',
    executionCount: 'executionCount',
  },
  baleybotExecutions: {
    id: 'id',
    baleybotId: 'baleybotId',
    status: 'status',
    createdAt: 'createdAt',
    completedAt: 'completedAt',
    durationMs: 'durationMs',
    error: 'error',
    triggeredBy: 'triggeredBy',
    tokenCount: 'tokenCount',
    startedAt: 'startedAt',
  },
  baleybotTriggers: {
    id: 'id',
    workspaceId: 'workspaceId',
    sourceBaleybotId: 'sourceBaleybotId',
    targetBaleybotId: 'targetBaleybotId',
    createdAt: 'createdAt',
  },
  baleybotMemory: {
    id: 'id',
    workspaceId: 'workspaceId',
    baleybotId: 'baleybotId',
    key: 'key',
    updatedAt: 'updatedAt',
  },
  connections: {
    id: 'id',
    workspaceId: 'workspaceId',
    type: 'type',
    isDefault: 'isDefault',
    createdAt: 'createdAt',
  },
  apiKeys: {
    id: 'id',
    workspaceId: 'workspaceId',
    name: 'name',
    keyHash: 'keyHash',
    keyPrefix: 'keyPrefix',
    keySuffix: 'keySuffix',
    permissions: 'permissions',
    revokedAt: 'revokedAt',
    createdAt: 'createdAt',
    lastUsedAt: 'lastUsedAt',
    expiresAt: 'expiresAt',
    createdBy: 'createdBy',
  },
  approvalPatterns: {
    id: 'id',
    workspaceId: 'workspaceId',
    tool: 'tool',
    trustLevel: 'trustLevel',
    revokedAt: 'revokedAt',
    timesUsed: 'timesUsed',
    createdAt: 'createdAt',
  },
  workspacePolicies: {
    id: 'id',
    workspaceId: 'workspaceId',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  workspaces: {
    id: 'id',
    name: 'name',
    slug: 'slug',
    ownerId: 'ownerId',
    version: 'version',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    deletedAt: 'deletedAt',
  },
  notifications: {
    id: 'id',
    workspaceId: 'workspaceId',
    userId: 'userId',
    readAt: 'readAt',
    createdAt: 'createdAt',
  },
  scheduledTasks: {
    id: 'id',
    workspaceId: 'workspaceId',
    status: 'status',
    runAt: 'runAt',
    baleybotId: 'baleybotId',
  },
  tools: {
    id: 'id',
    workspaceId: 'workspaceId',
    name: 'name',
    createdAt: 'createdAt',
  },
  flows: {
    id: 'id',
    workspaceId: 'workspaceId',
    triggers: 'triggers',
    version: 'version',
    createdAt: 'createdAt',
  },
  webhookLogs: {
    id: 'id',
    flowId: 'flowId',
    createdAt: 'createdAt',
  },
  blocks: {
    id: 'id',
    workspaceId: 'workspaceId',
    name: 'name',
    type: 'type',
    model: 'model',
  },
  blockExecutions: {
    blockId: 'blockId',
    model: 'model',
    tokensInput: 'tokensInput',
    tokensOutput: 'tokensOutput',
    durationMs: 'durationMs',
    createdAt: 'createdAt',
  },
  patterns: {
    id: 'id',
    blockId: 'blockId',
    rule: 'rule',
    condition: 'condition',
    outputTemplate: 'outputTemplate',
    confidence: 'confidence',
    supportCount: 'supportCount',
    generatedCode: 'generatedCode',
    updatedAt: 'updatedAt',
    samples: 'samples',
    patternType: 'patternType',
    createdAt: 'createdAt',
  },
  decisions: {
    id: 'id',
    blockId: 'blockId',
    input: 'input',
    output: 'output',
    reasoning: 'reasoning',
    model: 'model',
    feedbackCorrect: 'feedbackCorrect',
    feedbackCorrectedOutput: 'feedbackCorrectedOutput',
    createdAt: 'createdAt',
  },
} as const;

/**
 * Creates the standard `@baleyui/db` mock module used across all tRPC router tests.
 *
 * Includes all table schemas, Drizzle operator mocks, and helper function mocks.
 * Test files that need additional or overridden exports can spread the result:
 *
 * ```ts
 * vi.mock('@baleyui/db', () => ({
 *   ...createMockDbModule(),
 *   withTransaction: vi.fn(async (fn) => fn(mockTx)),
 * }));
 * ```
 */
export function createMockDbModule(): Record<string, unknown> {
  return {
    // Table schemas
    ...TABLE_SCHEMAS,

    // Drizzle operators
    eq: vi.fn((a: unknown, b: unknown) => ({ _type: 'eq', a, b })),
    and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
    desc: vi.fn((field: unknown) => ({ _type: 'desc', field })),
    isNull: vi.fn((field: unknown) => ({ _type: 'isNull', field })),
    isNotNull: vi.fn((field: unknown) => ({ _type: 'isNotNull', field })),
    inArray: vi.fn((field: unknown, values: unknown) => ({ _type: 'inArray', field, values })),
    gte: vi.fn((a: unknown, b: unknown) => ({ _type: 'gte', a, b })),
    lte: vi.fn((a: unknown, b: unknown) => ({ _type: 'lte', a, b })),
    sql: Object.assign(vi.fn(), { raw: vi.fn((v: string) => v) }),

    // Database helpers
    notDeleted: vi.fn(() => ({ _type: 'notDeleted' })),
    softDelete: vi.fn().mockResolvedValue({ id: 'deleted-id' }),
    updateWithLock: vi.fn().mockResolvedValue({ id: 'updated-id', version: 2 }),
  };
}
