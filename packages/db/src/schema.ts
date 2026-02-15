import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  integer,
  timestamp,
  decimal,
  numeric,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// BETTER AUTH CORE TABLES
// ============================================================================

export const user = pgTable(
  'user',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: varchar('image', { length: 2000 }),
    role: varchar('role', { length: 50 }).default('user'),
    banned: boolean('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    // Custom fields
    avatarUrl: varchar('avatar_url', { length: 2000 }),
    preferences: jsonb('preferences').default({}).$type<{
      theme?: 'light' | 'dark' | 'system';
      notificationEmail?: boolean;
      displayTimezone?: string;
    }>(),
  },
  (table) => [
    index('user_email_idx').on(table.email),
  ]
);

// Backwards-compatible alias so existing code referencing `users` keeps working
export const users = user;

export const session = pgTable(
  'session',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 })
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: varchar('ip_address', { length: 255 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    activeOrganizationId: varchar('active_organization_id', { length: 255 }),
  },
  (table) => [
    index('session_user_id_idx').on(table.userId),
    index('session_token_idx').on(table.token),
  ]
);

export const account = pgTable(
  'account',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 })
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    providerId: varchar('provider_id', { length: 255 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
  ]
);

export const verification = pgTable(
  'verification',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  }
);

// ============================================================================
// BETTER AUTH ORGANIZATION TABLES
// ============================================================================

export const organization = pgTable(
  'organization',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique(),
    logo: varchar('logo', { length: 2000 }),
    metadata: text('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }
);

export const member = pgTable(
  'member',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 })
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: varchar('organization_id', { length: 255 })
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('member_user_id_idx').on(table.userId),
    index('member_organization_id_idx').on(table.organizationId),
  ]
);

export const invitation = pgTable(
  'invitation',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    organizationId: varchar('organization_id', { length: 255 })
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 255 }),
    status: varchar('status', { length: 50 }).notNull(),
    inviterId: varchar('inviter_id', { length: 255 })
      .references(() => user.id, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('invitation_organization_id_idx').on(table.organizationId),
  ]
);

// ============================================================================
// WORKSPACES
// ============================================================================

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).unique().notNull(),
    ownerId: varchar('owner_id', { length: 255 }).notNull(),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('workspaces_owner_id_idx').on(table.ownerId),
    index('workspaces_deleted_at_idx').on(table.deletedAt),
  ]
);

// ============================================================================
// WORKSPACE MEMBERS
// ============================================================================

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('editor'),
      // 'admin' | 'editor' | 'operator' | 'viewer'
    addedBy: varchar('added_by', { length: 255 }),
    joinedAt: timestamp('joined_at').defaultNow(),

    // Soft delete
    deletedAt: timestamp('deleted_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ws_member_unique').on(table.workspaceId, table.userId),
    index('workspace_members_workspace_idx').on(table.workspaceId),
    index('workspace_members_user_idx').on(table.userId),
    index('workspace_members_deleted_idx').on(table.deletedAt),
    index('workspace_members_ws_deleted_idx').on(table.workspaceId, table.deletedAt),
  ]
);

// ============================================================================
// WORKSPACE INVITATIONS
// ============================================================================

export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('editor'),
    token: varchar('token', { length: 255 }).notNull().unique(),
    invitedBy: varchar('invited_by', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
      // 'pending' | 'accepted' | 'expired' | 'revoked'
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ws_invite_unique').on(table.workspaceId, table.email),
    index('workspace_invitations_workspace_idx').on(table.workspaceId),
    index('workspace_invitations_token_idx').on(table.token),
    index('workspace_invitations_status_idx').on(table.status),
  ]
);

// ============================================================================
// API KEYS
// ============================================================================

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(), // Display name for the key
    keyHash: varchar('key_hash', { length: 64 }).notNull(), // SHA256 hash of the key
    keyPrefix: varchar('key_prefix', { length: 20 }).notNull(), // First 12 chars for display (bui_live_XXX)
    keySuffix: varchar('key_suffix', { length: 4 }).notNull(), // Last 4 chars for display
    permissions: jsonb('permissions').notNull(), // Array of permissions ['read', 'execute', 'admin']
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'), // For soft revoke
    createdBy: varchar('created_by', { length: 255 }).notNull(), // User ID

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('api_keys_workspace_id_idx').on(table.workspaceId),
    index('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_revoked_at_idx').on(table.revokedAt),
    index('api_keys_workspace_revoked_idx').on(table.workspaceId, table.revokedAt),
  ]
);

// ============================================================================
// PROVIDER CONNECTIONS (OpenAI, Anthropic, Ollama, Database)
// ============================================================================

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'openai' | 'anthropic' | 'ollama' | 'postgres' | 'mysql' | 'mongodb'
    name: varchar('name', { length: 255 }).notNull(),
    config: jsonb('config').notNull(), // Encrypted credentials, base URLs, etc.
    isDefault: boolean('is_default').default(false),
    isOperational: boolean('is_operational').default(false), // If true, use this DB for BB execution results/analytics
    status: varchar('status', { length: 50 }).default('unconfigured'), // 'connected' | 'error' | 'unconfigured'

    // For Ollama
    availableModels: jsonb('available_models'), // Cached list of local models
    lastCheckedAt: timestamp('last_checked_at'),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('connections_workspace_id_idx').on(table.workspaceId),
    index('connections_type_idx').on(table.type),
    index('connections_status_idx').on(table.status),
    index('connections_deleted_at_idx').on(table.deletedAt),
  ]
);

// ============================================================================
// TOOLS (reusable across blocks)
// ============================================================================

export const tools = pgTable(
  'tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description').notNull(),
    inputSchema: jsonb('input_schema').notNull(), // Zod schema as JSON
    code: text('code').notNull(), // TypeScript function body

    // For database tools
    connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
    isGenerated: boolean('is_generated').default(false),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('tools_workspace_id_idx').on(table.workspaceId),
    index('tools_connection_id_idx').on(table.connectionId),
    index('tools_deleted_at_idx').on(table.deletedAt),
  ]
);

// ============================================================================
// BLOCKS (AI, Function, Composition patterns)
// ============================================================================

export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    type: varchar('type', { length: 50 }).notNull(), // 'ai' | 'function' | 'router' | 'pipeline' | 'loop' | 'parallel'
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    // Schemas
    inputSchema: jsonb('input_schema').default({}),
    outputSchema: jsonb('output_schema').default({}),

    // AI Block fields
    connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
    model: varchar('model', { length: 255 }),
    goal: text('goal'),
    systemPrompt: text('system_prompt'),
    temperature: decimal('temperature', { precision: 3, scale: 2 }),
    maxTokens: integer('max_tokens'),
    maxToolIterations: integer('max_tool_iterations').default(25),

    // Function Block fields
    code: text('code'),

    // Router Block fields (stores route configuration)
    routerConfig: jsonb('router_config'),

    // Loop Block fields
    loopConfig: jsonb('loop_config'),

    // Tools attached to this block
    toolIds: jsonb('tool_ids').default([]), // UUID[]

    // Execution mode (Phase 4.3: Hybrid Mode)
    executionMode: varchar('execution_mode', { length: 50 }).default('ai_only'), // 'ai_only' | 'code_only' | 'hybrid' | 'ab_test'
    generatedCode: text('generated_code'),
    codeGeneratedAt: timestamp('code_generated_at'),
    codeAccuracy: decimal('code_accuracy', { precision: 5, scale: 2 }),
    hybridThreshold: decimal('hybrid_threshold', { precision: 5, scale: 2 }).default('80.00'), // Confidence threshold for code path

    // Metrics
    executionCount: integer('execution_count').default(0),
    avgLatencyMs: integer('avg_latency_ms'),
    lastExecutedAt: timestamp('last_executed_at'),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('blocks_workspace_id_idx').on(table.workspaceId),
    index('blocks_type_idx').on(table.type),
    index('blocks_connection_id_idx').on(table.connectionId),
    index('blocks_deleted_at_idx').on(table.deletedAt),
  ]
);

// ============================================================================
// FLOWS (visual composition)
// ============================================================================

export const flows = pgTable(
  'flows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    // React Flow graph
    nodes: jsonb('nodes').default([]),
    edges: jsonb('edges').default([]),

    // Triggers
    triggers: jsonb('triggers').default([]), // webhook, schedule, manual

    enabled: boolean('enabled').default(false),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('flows_workspace_id_idx').on(table.workspaceId),
    index('flows_enabled_idx').on(table.enabled),
    index('flows_deleted_at_idx').on(table.deletedAt),
  ]
);

// ============================================================================
// FLOW EXECUTIONS
// ============================================================================

export const flowExecutions = pgTable(
  'flow_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flowId: uuid('flow_id')
      .references(() => flows.id, { onDelete: 'cascade' })
      .notNull(),
    flowVersion: integer('flow_version').notNull(),
    triggeredBy: jsonb('triggered_by').notNull(),
    status: varchar('status', { length: 50 }).notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    input: jsonb('input'),
    output: jsonb('output'),
    error: jsonb('error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('flow_executions_flow_id_idx').on(table.flowId),
    index('flow_executions_status_idx').on(table.status),
    index('flow_executions_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================================
// WEBHOOK LOGS (for webhook trigger invocations)
// ============================================================================

export const webhookLogs = pgTable(
  'webhook_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    flowId: uuid('flow_id')
      .references(() => flows.id, { onDelete: 'cascade' })
      .notNull(),
    webhookSecret: varchar('webhook_secret', { length: 100 }).notNull(),

    // Request data
    method: varchar('method', { length: 10 }).notNull(),
    headers: jsonb('headers'),
    body: jsonb('body'),
    query: jsonb('query'),

    // Response data
    status: varchar('status', { length: 50 }).notNull(), // 'success' | 'failed' | 'invalid_secret'
    statusCode: integer('status_code').notNull(),
    executionId: uuid('execution_id').references(() => flowExecutions.id, { onDelete: 'cascade' }),
    error: text('error'),

    // Client info
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('webhook_logs_flow_idx').on(table.flowId),
    index('webhook_logs_created_idx').on(table.createdAt),
  ]
);

// ============================================================================
// BLOCK EXECUTIONS (individual block runs, standalone or within flow)
// ============================================================================

export const blockExecutions = pgTable(
  'block_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: uuid('block_id')
      .references(() => blocks.id, { onDelete: 'cascade' })
      .notNull(),
    flowExecutionId: uuid('flow_execution_id').references(
      () => flowExecutions.id,
      { onDelete: 'cascade' }
    ),

    // BaleyBots runtime IDs
    baleybotId: varchar('baleybot_id', { length: 100 }), // e.g., 'baleybot-1-a3f891'
    parentBaleybotId: varchar('parent_baleybot_id', { length: 100 }),

    status: varchar('status', { length: 50 }).notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stale'
    input: jsonb('input'),
    output: jsonb('output'),
    error: text('error'),

    // For AI blocks
    model: varchar('model', { length: 255 }),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    reasoning: text('reasoning'), // For reasoning models

    // Hybrid mode tracking (Phase 4.3)
    executionPath: varchar('execution_path', { length: 20 }), // 'ai' | 'code'
    fallbackReason: text('fallback_reason'), // Why AI was used instead of code
    patternMatched: text('pattern_matched'), // Which pattern was matched (for code path)
    matchConfidence: decimal('match_confidence', { precision: 5, scale: 2 }), // Pattern match confidence

    // Streaming events (for replay)
    streamEvents: jsonb('stream_events').default([]),

    // Heartbeat for detecting stale executions
    heartbeatAt: timestamp('heartbeat_at'),
    heartbeatInterval: integer('heartbeat_interval_ms').default(5000),

    // Server instance tracking (for crash recovery)
    serverId: varchar('server_id', { length: 100 }),
    serverStartedAt: timestamp('server_started_at'),

    // Retry tracking
    attemptNumber: integer('attempt_number').default(1),
    maxAttempts: integer('max_attempts').default(3),

    // Event storage
    eventCount: integer('event_count').default(0),
    lastEventIndex: integer('last_event_index').default(-1),

    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('block_executions_block_id_idx').on(table.blockId),
    index('block_executions_flow_execution_id_idx').on(table.flowExecutionId),
    index('block_executions_status_idx').on(table.status),
    index('block_executions_created_at_idx').on(table.createdAt),
    index('block_exec_flow_created_idx').on(table.flowExecutionId, table.createdAt),
  ]
);

// ============================================================================
// TOOL EXECUTIONS (within block execution)
// ============================================================================

export const toolExecutions = pgTable(
  'tool_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockExecutionId: uuid('block_execution_id')
      .references(() => blockExecutions.id, { onDelete: 'cascade' })
      .notNull(),
    toolId: uuid('tool_id').references(() => tools.id, { onDelete: 'cascade' }),
    toolCallId: varchar('tool_call_id', { length: 100 }),
    toolName: varchar('tool_name', { length: 255 }).notNull(),
    arguments: jsonb('arguments'),
    result: jsonb('result'),
    error: text('error'),

    // Approval tracking
    requiresApproval: boolean('requires_approval').default(false),
    approvalStatus: varchar('approval_status', { length: 50 }), // 'pending' | 'approved' | 'rejected' | 'modified'
    approvalDecision: jsonb('approval_decision'),
    approvedAt: timestamp('approved_at'),

    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('tool_executions_block_execution_id_idx').on(table.blockExecutionId),
    index('tool_executions_tool_id_idx').on(table.toolId),
    index('tool_executions_approval_status_idx').on(table.approvalStatus),
    index('tool_executions_created_at_idx').on(table.createdAt),
  ]
);

// ============================================================================
// AI DECISIONS (derived from block executions, for observability)
// ============================================================================

export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: uuid('block_id')
      .references(() => blocks.id, { onDelete: 'cascade' })
      .notNull(),
    blockExecutionId: uuid('block_execution_id')
      .references(() => blockExecutions.id, { onDelete: 'cascade' })
      .notNull(),

    input: jsonb('input').notNull(),
    output: jsonb('output').notNull(),
    reasoning: text('reasoning'),

    model: varchar('model', { length: 255 }),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    latencyMs: integer('latency_ms'),
    cost: decimal('cost', { precision: 10, scale: 6 }), // Track cost per decision

    // Feedback
    feedbackCorrect: boolean('feedback_correct'),
    feedbackCategory: varchar('feedback_category', { length: 50 }), // 'hallucination' | 'wrong_format' | 'missing_info' | 'perfect' | 'partial'
    feedbackNotes: text('feedback_notes'),
    feedbackCorrectedOutput: jsonb('feedback_corrected_output'),
    feedbackAt: timestamp('feedback_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('decisions_block_idx').on(table.blockId),
    index('decisions_created_idx').on(table.createdAt),
    index('decisions_model_idx').on(table.model),
    index('decisions_created_id_idx').on(table.createdAt, table.id),
  ]
);

// ============================================================================
// PATTERNS (extracted rules from decisions)
// ============================================================================

export const patterns = pgTable(
  'patterns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: uuid('block_id')
      .references(() => blocks.id, { onDelete: 'cascade' })
      .notNull(),
    rule: text('rule').notNull(), // Human-readable
    condition: jsonb('condition').notNull(), // Machine-parseable (JSON Logic)
    outputTemplate: jsonb('output_template'),
    confidence: decimal('confidence', { precision: 5, scale: 4 }),
    supportCount: integer('support_count'),
    samples: jsonb('samples').default([]), // Array of {input, output, decisionId} for validation
    patternType: varchar('pattern_type', { length: 50 }), // 'threshold' | 'set_membership' | 'compound' | 'exact_match'
    generatedCode: text('generated_code'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('patterns_block_id_idx').on(table.blockId),
    index('patterns_pattern_type_idx').on(table.patternType),
  ]
);

// ============================================================================
// TEST CASES
// ============================================================================

export const testCases = pgTable(
  'test_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: uuid('block_id')
      .references(() => blocks.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    input: jsonb('input').notNull(),
    expectedOutput: jsonb('expected_output'),
    assertions: jsonb('assertions').default([]),
    tags: jsonb('tags').default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('test_cases_block_id_idx').on(table.blockId)]
);

// ============================================================================
// RESILIENCE INFRASTRUCTURE TABLES
// ============================================================================

// Execution Events (for stream replay and recovery)
// Stores every stream event for any execution, enabling reconnection and replay
export const executionEvents = pgTable(
  'execution_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    executionId: uuid('execution_id')
      .references(() => blockExecutions.id, { onDelete: 'cascade' })
      .notNull(),

    index: integer('index').notNull(), // Sequential for ordering
    eventType: varchar('event_type', { length: 50 }).notNull(),
    eventData: jsonb('event_data').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('execution_event_idx').on(table.executionId, table.index),
    index('execution_events_type_idx').on(table.eventType),
  ]
);

// Audit Logs (for compliance and debugging)
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // What changed
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 50 }).notNull(), // create, update, delete, restore

    // Who changed it
    userId: varchar('user_id', { length: 255 }),
    workspaceId: uuid('workspace_id'),

    // What the changes were
    changes: jsonb('changes'),
    previousValues: jsonb('previous_values'),

    // Context
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: varchar('request_id', { length: 100 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_entity_idx').on(table.entityType, table.entityId),
    index('audit_user_idx').on(table.userId),
    index('audit_time_idx').on(table.createdAt),
  ]
);

// Background Jobs (for reliable async execution)
export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Job type and data
    type: varchar('type', { length: 100 }).notNull(),
    data: jsonb('data').notNull(),

    // Scheduling
    status: varchar('status', { length: 50 }).default('pending'), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    priority: integer('priority').default(0),

    // Execution tracking
    attempts: integer('attempts').default(0),
    maxAttempts: integer('max_attempts').default(3),
    lastError: text('last_error'),

    // Locking
    lockedBy: varchar('locked_by', { length: 100 }),
    lockedAt: timestamp('locked_at'),

    // Timing
    scheduledFor: timestamp('scheduled_for').defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('job_status_priority_idx').on(table.status, table.priority),
    index('job_scheduled_idx').on(table.scheduledFor),
  ]
);

// ============================================================================
// BUILDER EVENTS (Event-Sourcing for UI Actions)
// ============================================================================

/**
 * Builder Events table stores immutable event records for all builder actions.
 * Enables: "watch AI build", undo/redo, time-travel, audit trail.
 */
export const builderEvents = pgTable(
  'builder_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Event metadata
    type: varchar('type', { length: 50 }).notNull(), // e.g., 'BlockCreated', 'FlowNodeAdded'
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Actor who caused this event
    actor: jsonb('actor').notNull(), // { type: 'user'|'ai-agent'|'system', userId/agentId, ... }

    // Event payload
    data: jsonb('data').notNull(), // Event-specific data (blockId, changes, etc.)

    // Versioning
    version: integer('version').default(1).notNull(),

    // For efficient querying by entity
    entityType: varchar('entity_type', { length: 50 }), // 'block', 'flow', 'connection', 'tool'
    entityId: uuid('entity_id'),

    // Sequence number for ordering within workspace
    sequenceNumber: integer('sequence_number').generatedAlwaysAsIdentity(),

    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('builder_events_workspace_idx').on(table.workspaceId),
    index('builder_events_entity_idx').on(table.entityType, table.entityId),
    index('builder_events_timestamp_idx').on(table.timestamp),
    index('builder_events_sequence_idx').on(table.sequenceNumber),
    index('builder_events_type_idx').on(table.type),
  ]
);

// ============================================================================
// BALEYBOTS (BAL-first architecture)
// ============================================================================

export const baleybots = pgTable(
  'baleybots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // User-facing
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 100 }), // emoji or icon name
    status: varchar('status', { length: 50 }).notNull().default('draft'), // draft, active, paused, error

    // Internal BaleyBots (system-managed, not user-created)
    isInternal: boolean('is_internal').default(false).notNull(),

    // Admin-edited flag: if true, seeding will not overwrite this bot's BAL code
    adminEdited: boolean('admin_edited').default(false).notNull(),

    // Lifecycle stage for Build -> Launch Prep -> Live flow
    lifecycleStage: varchar('lifecycle_stage', { length: 50 }).notNull().default('draft'), // draft, verified, launch_prepared, live, paused

    // Generated launch preparation artifact
    launchKit: jsonb('launch_kit'),

    // Generated runtime interface spec used by Live mode
    runtimeInterfaceSpec: jsonb('runtime_interface_spec'),

    // Lifecycle timestamps
    launchPreparedAt: timestamp('launch_prepared_at'),
    liveAt: timestamp('live_at'),
    pausedAt: timestamp('paused_at'),

    // Webhook trigger (optional secret for HTTP triggers)
    webhookSecret: varchar('webhook_secret', { length: 100 }),
    webhookEnabled: boolean('webhook_enabled').default(false),

    // BAL source of truth
    balCode: text('bal_code').notNull(),

    // Cached structure for visualization (from Pipeline.getStructure())
    structure: jsonb('structure'),

    // Entity names in this BB (for quick lookup)
    entityNames: jsonb('entity_names').$type<string[]>(),

    // BB dependencies (other BBs this one can call via spawn_baleybot)
    dependencies: jsonb('dependencies').$type<string[]>(),

    // Conversation history (for Creator Bot interactions)
    conversationHistory: jsonb('conversation_history').$type<
      Array<{
        id: string;
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
      }>
    >(),

    /** Persisted test cases for the lifecycle test panel */
    testCasesJson: jsonb('test_cases_json').$type<unknown[]>(),

    // Execution metrics
    executionCount: integer('execution_count').default(0),
    lastExecutedAt: timestamp('last_executed_at'),

    // User who created this BB
    createdBy: varchar('created_by', { length: 255 }),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('baleybots_workspace_idx').on(table.workspaceId),
    index('baleybots_status_idx').on(table.status),
    index('baleybots_lifecycle_stage_idx').on(table.lifecycleStage),
    index('baleybots_deleted_at_idx').on(table.deletedAt),
    uniqueIndex('baleybots_workspace_name_internal_idx')
      .on(table.workspaceId, table.name)
      .where(sql`${table.isInternal} = true`),
  ]
);

// ============================================================================
// BALEYBOT EXECUTIONS
// ============================================================================

export const baleybotExecutions = pgTable(
  'baleybot_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, running, completed, failed, cancelled

    input: jsonb('input'),
    output: jsonb('output'),
    error: text('error'),

    // StreamSegments stored for replay (BaleybotStreamEvent[])
    segments: jsonb('segments').$type<unknown[]>(),

    // Metrics
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
    tokenCount: integer('token_count'),

    // Detailed usage (populated at execution completion for direct analytics queries)
    model: varchar('model', { length: 255 }),
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    estimatedCost: doublePrecision('estimated_cost'),

    // Trigger info
    triggeredBy: varchar('triggered_by', { length: 50 }), // 'manual', 'schedule', 'webhook', 'other_bb'
    triggerSource: varchar('trigger_source', { length: 255 }), // e.g., BB ID if triggered by another BB

    // Idempotency key for webhook deduplication
    idempotencyKey: varchar('idempotency_key', { length: 255 }),

    // Conversation threading (groups multi-turn executions)
    conversationId: uuid('conversation_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('baleybot_executions_baleybot_idx').on(table.baleybotId),
    index('baleybot_executions_status_idx').on(table.status),
    index('baleybot_executions_created_idx').on(table.createdAt),
    index('baleybot_executions_model_idx').on(table.model),
    index('baleybot_executions_baleybot_status_idx').on(table.baleybotId, table.status),
    index('bb_exec_bot_created_idx').on(table.baleybotId, table.createdAt),
    index('bb_exec_conversation_idx').on(table.baleybotId, table.conversationId),
    index('bb_exec_status_created_idx').on(table.status, table.createdAt),
    uniqueIndex('bb_exec_idempotency_idx')
      .on(table.baleybotId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ]
);

// ============================================================================
// ORCHESTRATION RUNS + TASKS (Swarm execution traces)
// ============================================================================

export const orchestrationRuns = pgTable(
  'orchestration_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    rootExecutionId: uuid('root_execution_id').references(() => baleybotExecutions.id, {
      onDelete: 'set null',
    }),
    entryBot: varchar('entry_bot', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('running'), // running, completed, failed, cancelled
    objective: text('objective').notNull(),
    strategy: jsonb('strategy').default({}).notNull(),
    summary: text('summary'),
    metrics: jsonb('metrics').default({}).notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('orchestration_runs_workspace_idx').on(table.workspaceId),
    index('orchestration_runs_status_idx').on(table.status),
    index('orchestration_runs_started_idx').on(table.startedAt),
    index('orchestration_runs_root_exec_idx').on(table.rootExecutionId),
  ]
);

export const orchestrationTasks = pgTable(
  'orchestration_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .references(() => orchestrationRuns.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    parentTaskId: uuid('parent_task_id'),
    executionId: uuid('execution_id').references(() => baleybotExecutions.id, {
      onDelete: 'set null',
    }),
    assignedBot: varchar('assigned_bot', { length: 255 }).notNull(),
    expectedArtifact: varchar('expected_artifact', { length: 255 }),
    status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, running, completed, failed, skipped
    attempt: integer('attempt').default(0).notNull(),
    depth: integer('depth').default(0).notNull(),
    fingerprint: varchar('fingerprint', { length: 255 }),
    input: jsonb('input'),
    output: jsonb('output'),
    error: text('error'),
    issuePack: jsonb('issue_pack'),
    strategyHints: jsonb('strategy_hints').default([]).notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('orchestration_tasks_run_idx').on(table.runId),
    index('orchestration_tasks_workspace_idx').on(table.workspaceId),
    index('orchestration_tasks_parent_idx').on(table.parentTaskId),
    index('orchestration_tasks_status_idx').on(table.status),
    index('orchestration_tasks_bot_idx').on(table.assignedBot),
    index('orchestration_tasks_fingerprint_idx').on(table.fingerprint),
    index('orchestration_tasks_run_status_idx').on(table.runId, table.status),
  ]
);

// ============================================================================
// BALEYBOT TRIGGERS (BB completion chains)
// ============================================================================

export const baleybotTriggers = pgTable(
  'baleybot_triggers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Source BB (the one that triggers)
    sourceBaleybotId: uuid('source_baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    // Target BB (the one that gets triggered)
    targetBaleybotId: uuid('target_baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    // Trigger configuration
    triggerType: varchar('trigger_type', { length: 50 }).notNull(), // 'completion', 'success', 'failure'
    enabled: boolean('enabled').default(true),

    // Input mapping (how to pass data from source to target)
    inputMapping: jsonb('input_mapping'), // e.g., { "targetField": "sourceOutput.field" }
    staticInput: jsonb('static_input'), // Additional static input to pass

    // Conditions (optional)
    condition: text('condition'), // Optional condition expression

    // Soft delete
    deletedAt: timestamp('deleted_at'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('baleybot_triggers_workspace_idx').on(table.workspaceId),
    index('baleybot_triggers_source_idx').on(table.sourceBaleybotId),
    index('baleybot_triggers_target_idx').on(table.targetBaleybotId),
    index('baleybot_triggers_deleted_at_idx').on(table.deletedAt),
  ]
);

// ============================================================================
// APPROVAL PATTERNS (learned from "Approve & Remember")
// ============================================================================

export const approvalPatterns = pgTable(
  'approval_patterns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Pattern definition
    tool: varchar('tool', { length: 255 }).notNull(), // Tool name
    actionPattern: jsonb('action_pattern').notNull(), // e.g., { action: "refund", amount: "<=100" }
    entityGoalPattern: text('entity_goal_pattern'), // regex for matching entity goals

    // Trust level
    trustLevel: varchar('trust_level', { length: 50 }).notNull().default('provisional'), // provisional, trusted, permanent
    timesUsed: integer('times_used').notNull().default(0),

    // Audit
    approvedBy: varchar('approved_by', { length: 255 }),
    approvedAt: timestamp('approved_at'),
    expiresAt: timestamp('expires_at'),

    // Can be revoked
    revokedAt: timestamp('revoked_at'),
    revokedBy: varchar('revoked_by', { length: 255 }),
    revokeReason: text('revoke_reason'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('approval_patterns_workspace_idx').on(table.workspaceId),
    index('approval_patterns_tool_idx').on(table.tool),
  ]
);

// ============================================================================
// WORKSPACE POLICIES (tool governance)
// ============================================================================

export const workspacePolicies = pgTable(
  'workspace_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),

    // Tool policies
    allowedTools: jsonb('allowed_tools').$type<string[]>(),
    forbiddenTools: jsonb('forbidden_tools').$type<string[]>(),
    requiresApprovalTools: jsonb('requires_approval_tools').$type<string[]>(),

    // Global limits
    maxAutoApproveAmount: integer('max_auto_approve_amount'),
    reapprovalIntervalDays: integer('reapproval_interval_days').default(90),
    maxAutoFiresBeforeReview: integer('max_auto_fires_before_review').default(100),

    // Pattern learning manual (natural language guidelines for AI)
    learningManual: text('learning_manual'),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('workspace_policies_workspace_id_idx').on(table.workspaceId)]
);

// ============================================================================
// BALEYBOT MEMORY (for store_memory tool)
// ============================================================================

export const baleybotMemory = pgTable(
  'baleybot_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    // Key-value storage
    key: varchar('key', { length: 255 }).notNull(),
    value: jsonb('value').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('baleybot_memory_unique_key').on(
      table.workspaceId,
      table.baleybotId,
      table.key
    ),
    index('baleybot_memory_workspace_idx').on(table.workspaceId),
    index('baleybot_memory_baleybot_idx').on(table.baleybotId),
  ]
);

// ============================================================================
// BALEYBOT SHARED STORAGE (for cross-BB communication)
// ============================================================================

/**
 * Workspace-scoped shared storage for async BB communication.
 * Unlike baleybotMemory which is per-BB, this is accessible by all BBs in the workspace.
 */
export const baleybotSharedStorage = pgTable(
  'baleybot_shared_storage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Key-value storage
    key: varchar('key', { length: 255 }).notNull(),
    value: jsonb('value').notNull(),

    // Producer tracking
    producerId: uuid('producer_id').references(() => baleybots.id, {
      onDelete: 'set null',
    }),
    executionId: uuid('execution_id').references(() => baleybotExecutions.id, {
      onDelete: 'set null',
    }),

    // Optional TTL for automatic cleanup
    expiresAt: timestamp('expires_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('baleybot_shared_storage_unique_key').on(
      table.workspaceId,
      table.key
    ),
    index('baleybot_shared_storage_workspace_idx').on(table.workspaceId),
    index('baleybot_shared_storage_expires_idx').on(table.expiresAt),
  ]
);

// ============================================================================
// NOTIFICATIONS (for send_notification tool)
// ============================================================================

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),

    // Who to notify
    userId: varchar('user_id', { length: 255 }).notNull(), // User ID

    // Notification content
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    priority: varchar('priority', { length: 20 }).notNull().default('normal'), // low, normal, high

    // Source tracking
    sourceType: varchar('source_type', { length: 50 }), // 'baleybot', 'system', etc.
    sourceId: uuid('source_id'), // e.g., baleybot ID that sent it
    executionId: uuid('execution_id'), // e.g., execution that triggered it

    // Status
    readAt: timestamp('read_at'),
    dismissedAt: timestamp('dismissed_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('notifications_workspace_idx').on(table.workspaceId),
    index('notifications_user_idx').on(table.userId),
    index('notifications_unread_idx').on(table.userId, table.readAt),
    index('notifications_created_idx').on(table.createdAt),
  ]
);

// ============================================================================
// SCHEDULED TASKS (for schedule_task tool)
// ============================================================================

export const scheduledTasks = pgTable(
  'scheduled_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    // Scheduling
    runAt: timestamp('run_at').notNull(), // When to run
    cronExpression: varchar('cron_expression', { length: 100 }), // For recurring tasks

    // Input to pass when running
    input: jsonb('input'),

    // Status
    status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, running, completed, failed, cancelled

    // Execution tracking
    lastRunAt: timestamp('last_run_at'),
    lastRunStatus: varchar('last_run_status', { length: 50 }),
    lastRunError: text('last_run_error'),
    executionId: uuid('execution_id'), // Links to baleybotExecutions when run

    // For recurring tasks
    runCount: integer('run_count').default(0),
    maxRuns: integer('max_runs'), // null = unlimited

    // Approval tracking
    approvedBy: varchar('approved_by', { length: 255 }),
    approvedAt: timestamp('approved_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('scheduled_tasks_workspace_idx').on(table.workspaceId),
    index('scheduled_tasks_baleybot_idx').on(table.baleybotId),
    index('scheduled_tasks_pending_idx').on(table.status, table.runAt),
    index('scheduled_tasks_ws_status_run_idx').on(table.workspaceId, table.status, table.runAt),
  ]
);

// ============================================================================
// COMPANION CONVERSATIONS (Baley AI assistant activity logging)
// ============================================================================

export const companionConversations = pgTable(
  'companion_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    messages: jsonb('messages').notNull().$type<
      Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: string;
      }>
    >(),
    actionsTaken: jsonb('actions_taken')
      .default([])
      .$type<
        Array<{
          tool: string;
          args: Record<string, unknown>;
          result: string;
          timestamp: string;
        }>
      >(),
    pageContext: varchar('page_context', { length: 255 }),
    executionId: uuid('execution_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('companion_conversations_workspace_idx').on(table.workspaceId),
    index('companion_conversations_user_idx').on(table.userId),
    index('companion_conversations_created_idx').on(table.createdAt),
  ]
);

// ============================================================================
// RECOMMENDATIONS (actionable findings from internal BaleyBots)
// ============================================================================

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    sourceType: varchar('source_type', { length: 50 }).notNull(),
    sourceBaleybotId: uuid('source_baleybot_id')
      .references(() => baleybots.id, { onDelete: 'set null' }),
    sourceExecutionId: uuid('source_execution_id')
      .references(() => baleybotExecutions.id, { onDelete: 'set null' }),
    targetBaleybotId: uuid('target_baleybot_id')
      .references(() => baleybots.id, { onDelete: 'set null' }),
    targetType: varchar('target_type', { length: 50 }).notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull(),
    severity: varchar('severity', { length: 20 }).notNull().default('info'),
    proposedAction: jsonb('proposed_action'),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    decidedBy: varchar('decided_by', { length: 255 }),
    decidedAt: timestamp('decided_at'),
    decisionNote: text('decision_note'),
    confidence: doublePrecision('confidence'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('recommendations_workspace_idx').on(table.workspaceId),
    index('recommendations_status_idx').on(table.status),
    index('recommendations_target_bb_idx').on(table.targetBaleybotId),
    index('recommendations_source_type_idx').on(table.sourceType),
    index('recommendations_ws_status_idx').on(table.workspaceId, table.status),
    index('recommendations_created_idx').on(table.createdAt),
  ]
);

// ============================================================================
// SHARED CONTEXT (workspace-scoped knowledge for BB execution)
// ============================================================================

export const sharedContext = pgTable(
  'shared_context',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    value: text('value').notNull(),
    description: text('description'),
    category: varchar('category', { length: 100 }).default('general'),
    contentType: varchar('content_type', { length: 20 }).default('text').notNull(),
    // 'text' = manual entry, 'file' = uploaded file with extracted text
    fileMetadata: jsonb('file_metadata'),
    // When contentType='file': { fileName, fileType, fileSizeBytes, uploadedAt }
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: varchar('created_by', { length: 255 }),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('shared_context_ws_key_idx').on(table.workspaceId, table.key),
    index('shared_context_workspace_idx').on(table.workspaceId),
    index('shared_context_category_idx').on(table.category),
    index('shared_context_active_idx').on(table.isActive),
  ]
);

// ============================================================================
// DESIGN PACKAGES (theming / brand calibration)
// ============================================================================

export const designPackages = pgTable(
  'design_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    packageData: jsonb('package_data').notNull(), // DesignPackageData
    sourceType: varchar('source_type', { length: 50 }).default('ai_generated'), // 'ai_generated' | 'manual' | 'preset'
    sourceResources: jsonb('source_resources'), // Array<{name, type, uploadedAt}>
    isDefault: boolean('is_default').default(false),

    // Optimistic locking
    version: integer('version').default(1).notNull(),

    createdBy: varchar('created_by', { length: 255 }),
    updatedBy: varchar('updated_by', { length: 255 }),

    // Soft delete fields
    deletedAt: timestamp('deleted_at'),
    deletedBy: varchar('deleted_by', { length: 255 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('design_packages_workspace_idx').on(table.workspaceId),
  ]
);

// ============================================================================
// BALEYBOT METRICS (for analytics tracking)
// ============================================================================

/**
 * Raw metrics recorded on each BB execution
 */
export const baleybotMetrics = pgTable(
  'baleybot_metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),
    executionId: uuid('execution_id').references(() => baleybotExecutions.id, {
      onDelete: 'set null',
    }),

    // Metric definition
    metricName: varchar('metric_name', { length: 255 }).notNull(),
    metricType: varchar('metric_type', { length: 50 }).notNull(), // count, average, percentage, top_n, trend, distribution

    // Metric value
    value: doublePrecision('value'),
    dimensions: jsonb('dimensions'), // For top_n, distribution (stores breakdown data)

    // Timestamp for time-series
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => [
    index('baleybot_metrics_workspace_idx').on(table.workspaceId),
    index('baleybot_metrics_baleybot_idx').on(table.baleybotId),
    index('baleybot_metrics_name_idx').on(table.metricName),
    index('baleybot_metrics_timestamp_idx').on(table.timestamp),
    index('baleybot_metrics_baleybot_time_idx').on(
      table.baleybotId,
      table.timestamp
    ),
  ]
);

/**
 * Aggregated metrics (hourly, daily, weekly)
 */
export const baleybotMetricAggregates = pgTable(
  'baleybot_metric_aggregates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    // Metric definition
    metricName: varchar('metric_name', { length: 255 }).notNull(),

    // Aggregation period
    period: varchar('period', { length: 20 }).notNull(), // 'hour', 'day', 'week', 'month'
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),

    // Aggregated values
    value: doublePrecision('value'),
    minValue: doublePrecision('min_value'),
    maxValue: doublePrecision('max_value'),
    sumValue: doublePrecision('sum_value'),
    sampleCount: integer('sample_count').notNull(),

    // For comparison
    previousPeriodValue: doublePrecision('previous_period_value'),
    changePercent: doublePrecision('change_percent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('baleybot_aggregates_workspace_idx').on(table.workspaceId),
    index('baleybot_aggregates_baleybot_idx').on(table.baleybotId),
    index('baleybot_aggregates_period_idx').on(table.period, table.periodStart),
    uniqueIndex('baleybot_aggregates_unique').on(
      table.baleybotId,
      table.metricName,
      table.period,
      table.periodStart
    ),
  ]
);

/**
 * Usage tracking for cost analysis and optimization
 */
export const baleybotUsage = pgTable(
  'baleybot_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),
    executionId: uuid('execution_id').references(() => baleybotExecutions.id, {
      onDelete: 'set null',
    }),

    // Token usage
    tokenInput: integer('token_input').default(0),
    tokenOutput: integer('token_output').default(0),
    tokenTotal: integer('token_total').default(0),

    // Call counts
    apiCalls: integer('api_calls').default(0),
    toolCalls: integer('tool_calls').default(0),

    // Duration
    durationMs: integer('duration_ms'),

    // Cost estimation
    estimatedCost: doublePrecision('estimated_cost'),
    model: varchar('model', { length: 255 }),

    // Timestamp for time-series
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => [
    index('baleybot_usage_workspace_idx').on(table.workspaceId),
    index('baleybot_usage_baleybot_idx').on(table.baleybotId),
    index('baleybot_usage_execution_idx').on(table.executionId),
    index('baleybot_usage_timestamp_idx').on(table.timestamp),
    index('baleybot_usage_baleybot_time_idx').on(table.baleybotId, table.timestamp),
  ]
);

/**
 * Alerts triggered by analytics conditions
 */
export const baleybotAlerts = pgTable(
  'baleybot_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    baleybotId: uuid('baleybot_id')
      .references(() => baleybots.id, { onDelete: 'cascade' })
      .notNull(),

    // Alert condition that was triggered
    alertCondition: varchar('alert_condition', { length: 500 }).notNull(),

    // Values at time of trigger
    triggeredValue: doublePrecision('triggered_value'),
    thresholdValue: doublePrecision('threshold_value'),
    metricName: varchar('metric_name', { length: 255 }),

    // Status
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, acknowledged, resolved
    severity: varchar('severity', { length: 20 }).notNull().default('warning'), // info, warning, critical

    // Timestamps
    triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
    acknowledgedAt: timestamp('acknowledged_at'),
    acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
    resolvedAt: timestamp('resolved_at'),
    resolvedBy: varchar('resolved_by', { length: 255 }),

    // Additional context
    message: text('message'),
    context: jsonb('context'),
  },
  (table) => [
    index('baleybot_alerts_workspace_idx').on(table.workspaceId),
    index('baleybot_alerts_baleybot_idx').on(table.baleybotId),
    index('baleybot_alerts_status_idx').on(table.status),
    index('baleybot_alerts_triggered_idx').on(table.triggeredAt),
  ]
);

// ============================================================================
// PLANS (billing tier definitions)
// ============================================================================

export const plans = pgTable('plans', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'free', 'pro', 'team'
  name: varchar('name', { length: 100 }).notNull(),
  stripePriceId: varchar('stripe_price_id', { length: 100 }),
  limits: jsonb('limits').notNull(), // PlanLimits JSON
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// SUBSCRIPTIONS (workspace → plan binding via Stripe)
// ============================================================================

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    planId: varchar('plan_id', { length: 50 })
      .references(() => plans.id)
      .notNull(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
    status: varchar('status', { length: 20 }).notNull(), // active, past_due, cancelled, trialing
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('subscriptions_workspace_idx').on(table.workspaceId),
    index('subscriptions_plan_idx').on(table.planId),
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_stripe_customer_idx').on(table.stripeCustomerId),
  ]
);

// ============================================================================
// AI MODELS (model library)
// ============================================================================

export const aiModels = pgTable('ai_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  modelId: varchar('model_id', { length: 128 }).notNull().unique(),
  provider: varchar('provider', { length: 32 }).notNull(),
  displayName: varchar('display_name', { length: 64 }).notNull(),
  family: varchar('family', { length: 64 }).notNull(),
  version: varchar('version', { length: 32 }),
  tier: varchar('tier', { length: 16 }).notNull(),
  contextWindow: integer('context_window'),
  maxOutputTokens: integer('max_output_tokens'),
  inputCostPer1mTokens: numeric('input_cost_per_1m_tokens'),
  outputCostPer1mTokens: numeric('output_cost_per_1m_tokens'),
  cachedInputCostPer1mTokens: numeric('cached_input_cost_per_1m_tokens'),
  capabilities: jsonb('capabilities').$type<{
    reasoning?: boolean;
    vision?: boolean;
    toolUse?: boolean;
    streaming?: boolean;
    structuredOutput?: boolean;
    codeGeneration?: 'basic' | 'good' | 'excellent';
    creativeWriting?: 'basic' | 'good' | 'excellent';
    analysis?: 'basic' | 'good' | 'excellent';
  }>(),
  sdkSupported: boolean('sdk_supported').notNull().default(true),
  apiAvailability: jsonb('api_availability').$type<{
    openai?: { available: boolean; deprecationDate?: string; sunsetDate?: string };
    anthropic?: { available: boolean; deprecationDate?: string; sunsetDate?: string };
    ollama?: { available: boolean; tags?: string[] };
  }>(),
  isLatest: boolean('is_latest').notNull().default(false),
  isDefault: boolean('is_default').notNull().default(false),
  releasedAt: timestamp('released_at'),
  deprecatedAt: timestamp('deprecated_at'),
  sunsetAt: timestamp('sunset_at'),
  lastVerifiedAt: timestamp('last_verified_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('ai_models_provider_idx').on(table.provider),
  index('ai_models_tier_idx').on(table.tier),
  index('ai_models_family_idx').on(table.family),
  index('ai_models_deprecated_idx').on(table.deprecatedAt),
]);

// No relations needed - aiModels is a standalone reference table

// ============================================================================
// PLATFORM BUGS (AI-triaged error tracking)
// ============================================================================

export const platformBugs = pgTable('platform_bugs', {
  id: uuid('id').defaultRandom().primaryKey(),
  errorHash: varchar('error_hash', { length: 64 }).notNull(),
  title: text('title'),
  errorMessage: text('error_message').notNull(),
  stackTrace: text('stack_trace'),
  source: text('source').notNull(), // 'client' | 'server' | 'streaming'
  category: text('category').notNull(), // 'react_crash' | 'uncaught_exception' | 'api_5xx' | 'streaming_error'
  severity: text('severity').default('medium'), // 'low' | 'medium' | 'high' | 'critical'
  status: text('status').default('new').notNull(), // 'new' | 'acknowledged' | 'filed' | 'resolved' | 'wontfix'
  environment: text('environment').default('production'),
  occurrenceCount: integer('occurrence_count').default(1).notNull(),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  affectedWorkspaces: jsonb('affected_workspaces').$type<string[]>().default([]),
  affectedRoutes: jsonb('affected_routes').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  rootCause: text('root_cause'),
  suggestedFix: text('suggested_fix'),
  triageConfidence: doublePrecision('triage_confidence'),
  githubIssueUrl: text('github_issue_url'),
  githubIssueNumber: integer('github_issue_number'),
  resolvedAt: timestamp('resolved_at'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
  version: integer('version').default(1).notNull(),
}, (table) => [
  index('platform_bugs_error_hash_idx').on(table.errorHash),
  index('platform_bugs_status_idx').on(table.status),
  index('platform_bugs_severity_idx').on(table.severity),
  index('platform_bugs_last_seen_idx').on(table.lastSeenAt),
]);

// No relations needed - platformBugs is a standalone global table

// ============================================================================
// RELATIONS
// ============================================================================

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [subscriptions.workspaceId],
    references: [workspaces.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const builderEventsRelations = relations(builderEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [builderEvents.workspaceId],
    references: [workspaces.id],
  }),
}));

export const baleybotsRelations = relations(baleybots, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [baleybots.workspaceId],
    references: [workspaces.id],
  }),
  executions: many(baleybotExecutions),
  memory: many(baleybotMemory),
  scheduledTasks: many(scheduledTasks),
  sharedStorageProduced: many(baleybotSharedStorage),
  metrics: many(baleybotMetrics),
  metricAggregates: many(baleybotMetricAggregates),
  alerts: many(baleybotAlerts),
  usage: many(baleybotUsage),
  // Trigger relations (BB completion chains)
  triggeredBy: many(baleybotTriggers, { relationName: 'triggeredBy' }),
  triggeredTargets: many(baleybotTriggers, { relationName: 'triggeredTargets' }),
  // Recommendations targeting this BB
  recommendationsReceived: many(recommendations, { relationName: 'recommendationTarget' }),
}));

export const baleybotUsageRelations = relations(baleybotUsage, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [baleybotUsage.workspaceId],
    references: [workspaces.id],
  }),
  baleybot: one(baleybots, {
    fields: [baleybotUsage.baleybotId],
    references: [baleybots.id],
  }),
  execution: one(baleybotExecutions, {
    fields: [baleybotUsage.executionId],
    references: [baleybotExecutions.id],
  }),
}));

export const baleybotMetricsRelations = relations(baleybotMetrics, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [baleybotMetrics.workspaceId],
    references: [workspaces.id],
  }),
  baleybot: one(baleybots, {
    fields: [baleybotMetrics.baleybotId],
    references: [baleybots.id],
  }),
  execution: one(baleybotExecutions, {
    fields: [baleybotMetrics.executionId],
    references: [baleybotExecutions.id],
  }),
}));

export const baleybotMetricAggregatesRelations = relations(
  baleybotMetricAggregates,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [baleybotMetricAggregates.workspaceId],
      references: [workspaces.id],
    }),
    baleybot: one(baleybots, {
      fields: [baleybotMetricAggregates.baleybotId],
      references: [baleybots.id],
    }),
  })
);

export const baleybotAlertsRelations = relations(baleybotAlerts, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [baleybotAlerts.workspaceId],
    references: [workspaces.id],
  }),
  baleybot: one(baleybots, {
    fields: [baleybotAlerts.baleybotId],
    references: [baleybots.id],
  }),
}));

export const baleybotMemoryRelations = relations(baleybotMemory, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [baleybotMemory.workspaceId],
    references: [workspaces.id],
  }),
  baleybot: one(baleybots, {
    fields: [baleybotMemory.baleybotId],
    references: [baleybots.id],
  }),
}));

export const baleybotSharedStorageRelations = relations(
  baleybotSharedStorage,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [baleybotSharedStorage.workspaceId],
      references: [workspaces.id],
    }),
    producer: one(baleybots, {
      fields: [baleybotSharedStorage.producerId],
      references: [baleybots.id],
    }),
    execution: one(baleybotExecutions, {
      fields: [baleybotSharedStorage.executionId],
      references: [baleybotExecutions.id],
    }),
  })
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [notifications.workspaceId],
    references: [workspaces.id],
  }),
}));

export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [scheduledTasks.workspaceId],
    references: [workspaces.id],
  }),
  baleybot: one(baleybots, {
    fields: [scheduledTasks.baleybotId],
    references: [baleybots.id],
  }),
}));

export const companionConversationsRelations = relations(companionConversations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [companionConversations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const baleybotExecutionsRelations = relations(baleybotExecutions, ({ one, many }) => ({
  baleybot: one(baleybots, {
    fields: [baleybotExecutions.baleybotId],
    references: [baleybots.id],
  }),
  orchestrationRuns: many(orchestrationRuns),
  orchestrationTasks: many(orchestrationTasks),
}));

export const orchestrationRunsRelations = relations(orchestrationRuns, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [orchestrationRuns.workspaceId],
    references: [workspaces.id],
  }),
  rootExecution: one(baleybotExecutions, {
    fields: [orchestrationRuns.rootExecutionId],
    references: [baleybotExecutions.id],
  }),
  tasks: many(orchestrationTasks),
}));

export const orchestrationTasksRelations = relations(orchestrationTasks, ({ one, many }) => ({
  run: one(orchestrationRuns, {
    fields: [orchestrationTasks.runId],
    references: [orchestrationRuns.id],
  }),
  workspace: one(workspaces, {
    fields: [orchestrationTasks.workspaceId],
    references: [workspaces.id],
  }),
  execution: one(baleybotExecutions, {
    fields: [orchestrationTasks.executionId],
    references: [baleybotExecutions.id],
  }),
  parentTask: one(orchestrationTasks, {
    fields: [orchestrationTasks.parentTaskId],
    references: [orchestrationTasks.id],
    relationName: 'orchestrationTaskParent',
  }),
  childTasks: many(orchestrationTasks, {
    relationName: 'orchestrationTaskParent',
  }),
}));

export const approvalPatternsRelations = relations(approvalPatterns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [approvalPatterns.workspaceId],
    references: [workspaces.id],
  }),
}));

export const baleybotTriggersRelations = relations(baleybotTriggers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [baleybotTriggers.workspaceId],
    references: [workspaces.id],
  }),
  sourceBaleybot: one(baleybots, {
    fields: [baleybotTriggers.sourceBaleybotId],
    references: [baleybots.id],
    relationName: 'triggeredBy',
  }),
  targetBaleybot: one(baleybots, {
    fields: [baleybotTriggers.targetBaleybotId],
    references: [baleybots.id],
    relationName: 'triggeredTargets',
  }),
}));

export const workspacePoliciesRelations = relations(workspacePolicies, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspacePolicies.workspaceId],
    references: [workspaces.id],
  }),
}));

export const blockExecutionsRelations = relations(blockExecutions, ({ one, many }) => ({
  block: one(blocks, {
    fields: [blockExecutions.blockId],
    references: [blocks.id],
  }),
  flowExecution: one(flowExecutions, {
    fields: [blockExecutions.flowExecutionId],
    references: [flowExecutions.id],
  }),
  events: many(executionEvents),
  toolExecutions: many(toolExecutions),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [blocks.workspaceId],
    references: [workspaces.id],
  }),
  connection: one(connections, {
    fields: [blocks.connectionId],
    references: [connections.id],
  }),
  executions: many(blockExecutions),
  testCases: many(testCases),
  decisions: many(decisions),
  patterns: many(patterns),
}));

export const executionEventsRelations = relations(executionEvents, ({ one }) => ({
  execution: one(blockExecutions, {
    fields: [executionEvents.executionId],
    references: [blockExecutions.id],
  }),
}));

export const userRelations = relations(user, ({ many }) => ({
  workspaces: many(workspaces),
  memberships: many(workspaceMembers),
  sessions: many(session),
  accounts: many(account),
}));

// Backwards-compatible alias
export const usersRelations = userRelations;

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(user, {
    fields: [workspaceMembers.userId],
    references: [user.id],
  }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvitations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(user, {
    fields: [workspaces.ownerId],
    references: [user.id],
  }),
  members: many(workspaceMembers),
  invitations: many(workspaceInvitations),
  connections: many(connections),
  tools: many(tools),
  blocks: many(blocks),
  flows: many(flows),
  apiKeys: many(apiKeys),
  builderEvents: many(builderEvents),
  baleybots: many(baleybots),
  approvalPatterns: many(approvalPatterns),
  workspacePolicies: one(workspacePolicies),
  baleybotMemory: many(baleybotMemory),
  notifications: many(notifications),
  scheduledTasks: many(scheduledTasks),
  companionConversations: many(companionConversations),
  recommendations: many(recommendations),
  sharedContext: many(sharedContext),
  designPackages: many(designPackages),
  orchestrationRuns: many(orchestrationRuns),
  orchestrationTasks: many(orchestrationTasks),
}));

export const recommendationsRelations = relations(recommendations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [recommendations.workspaceId],
    references: [workspaces.id],
  }),
  sourceBaleybot: one(baleybots, {
    fields: [recommendations.sourceBaleybotId],
    references: [baleybots.id],
    relationName: 'recommendationSource',
  }),
  targetBaleybot: one(baleybots, {
    fields: [recommendations.targetBaleybotId],
    references: [baleybots.id],
    relationName: 'recommendationTarget',
  }),
}));

export const sharedContextRelations = relations(sharedContext, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [sharedContext.workspaceId],
    references: [workspaces.id],
  }),
}));

export const designPackagesRelations = relations(designPackages, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [designPackages.workspaceId],
    references: [workspaces.id],
  }),
  assets: many(designPackageAssets),
}));

// ============================================================================
// DESIGN PACKAGE ASSETS (uploaded brand files for calibration)
// ============================================================================

export const designPackageAssets = pgTable('design_package_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  designPackageId: uuid('design_package_id').references(() => designPackages.id, { onDelete: 'set null' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  blobUrl: text('blob_url').notNull(),
  blobDownloadUrl: text('blob_download_url').notNull(),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  mimeType: varchar('mime_type', { length: 255 }).notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedBy: varchar('uploaded_by', { length: 255 }),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('dpa_workspace_idx').on(table.workspaceId),
  index('dpa_session_idx').on(table.sessionId),
  index('dpa_package_idx').on(table.designPackageId),
]);

export const designPackageAssetsRelations = relations(designPackageAssets, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [designPackageAssets.workspaceId],
    references: [workspaces.id],
  }),
  designPackage: one(designPackages, {
    fields: [designPackageAssets.designPackageId],
    references: [designPackages.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id],
  }),
}));

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [connections.workspaceId],
    references: [workspaces.id],
  }),
  blocks: many(blocks),
  tools: many(tools),
}));

export const toolsRelations = relations(tools, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tools.workspaceId],
    references: [workspaces.id],
  }),
  connection: one(connections, {
    fields: [tools.connectionId],
    references: [connections.id],
  }),
  toolExecutions: many(toolExecutions),
}));

export const toolExecutionsRelations = relations(toolExecutions, ({ one }) => ({
  blockExecution: one(blockExecutions, {
    fields: [toolExecutions.blockExecutionId],
    references: [blockExecutions.id],
  }),
  tool: one(tools, {
    fields: [toolExecutions.toolId],
    references: [tools.id],
  }),
}));

export const flowsRelations = relations(flows, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [flows.workspaceId],
    references: [workspaces.id],
  }),
  executions: many(flowExecutions),
  webhookLogs: many(webhookLogs),
}));

export const flowExecutionsRelations = relations(flowExecutions, ({ one, many }) => ({
  flow: one(flows, {
    fields: [flowExecutions.flowId],
    references: [flows.id],
  }),
  blockExecutions: many(blockExecutions),
  webhookLogs: many(webhookLogs),
}));

export const webhookLogsRelations = relations(webhookLogs, ({ one }) => ({
  flow: one(flows, {
    fields: [webhookLogs.flowId],
    references: [flows.id],
  }),
  execution: one(flowExecutions, {
    fields: [webhookLogs.executionId],
    references: [flowExecutions.id],
  }),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  block: one(blocks, {
    fields: [decisions.blockId],
    references: [blocks.id],
  }),
  blockExecution: one(blockExecutions, {
    fields: [decisions.blockExecutionId],
    references: [blockExecutions.id],
  }),
}));

export const patternsRelations = relations(patterns, ({ one }) => ({
  block: one(blocks, {
    fields: [patterns.blockId],
    references: [blocks.id],
  }),
}));

export const testCasesRelations = relations(testCases, ({ one }) => ({
  block: one(blocks, {
    fields: [testCases.blockId],
    references: [blocks.id],
  }),
}));
