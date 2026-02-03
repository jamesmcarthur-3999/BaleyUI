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
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// WORKSPACES
// ============================================================================

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  ownerId: varchar('owner_id', { length: 255 }).notNull(), // Clerk user ID

  // Soft delete fields
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 255 }),

  // Optimistic locking
  version: integer('version').default(1).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// API KEYS
// ============================================================================

export const apiKeys = pgTable('api_keys', {
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
  createdBy: varchar('created_by', { length: 255 }).notNull(), // Clerk user ID

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// PROVIDER CONNECTIONS (OpenAI, Anthropic, Ollama, Database)
// ============================================================================

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'openai' | 'anthropic' | 'ollama' | 'postgres' | 'mysql' | 'mongodb'
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').notNull(), // Encrypted credentials, base URLs, etc.
  isDefault: boolean('is_default').default(false),
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
});

// ============================================================================
// TOOLS (reusable across blocks)
// ============================================================================

export const tools = pgTable('tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  inputSchema: jsonb('input_schema').notNull(), // Zod schema as JSON
  code: text('code').notNull(), // TypeScript function body

  // For database tools
  connectionId: uuid('connection_id').references(() => connections.id),
  isGenerated: boolean('is_generated').default(false),

  // Soft delete fields
  deletedAt: timestamp('deleted_at'),
  deletedBy: varchar('deleted_by', { length: 255 }),

  // Optimistic locking
  version: integer('version').default(1).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// BLOCKS (AI, Function, Composition patterns)
// ============================================================================

export const blocks = pgTable('blocks', {
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
  connectionId: uuid('connection_id').references(() => connections.id),
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
});

// ============================================================================
// FLOWS (visual composition)
// ============================================================================

export const flows = pgTable('flows', {
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
});

// ============================================================================
// FLOW EXECUTIONS
// ============================================================================

export const flowExecutions = pgTable('flow_executions', {
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
});

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
    executionId: uuid('execution_id').references(() => flowExecutions.id),
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

export const blockExecutions = pgTable('block_executions', {
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

  status: varchar('status', { length: 50 }).notNull(), // 'pending' | 'running' | 'complete' | 'failed' | 'cancelled' | 'stale'
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
});

// ============================================================================
// TOOL EXECUTIONS (within block execution)
// ============================================================================

export const toolExecutions = pgTable('tool_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockExecutionId: uuid('block_execution_id')
    .references(() => blockExecutions.id, { onDelete: 'cascade' })
    .notNull(),
  toolId: uuid('tool_id').references(() => tools.id),
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
});

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
  ]
);

// ============================================================================
// PATTERNS (extracted rules from decisions)
// ============================================================================

export const patterns = pgTable('patterns', {
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
});

// ============================================================================
// TEST CASES
// ============================================================================

export const testCases = pgTable('test_cases', {
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
});

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

    // Trigger info
    triggeredBy: varchar('triggered_by', { length: 50 }), // 'manual', 'schedule', 'webhook', 'other_bb'
    triggerSource: varchar('trigger_source', { length: 255 }), // e.g., BB ID if triggered by another BB

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('baleybot_executions_baleybot_idx').on(table.baleybotId),
    index('baleybot_executions_status_idx').on(table.status),
    index('baleybot_executions_created_idx').on(table.createdAt),
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

export const workspacePolicies = pgTable('workspace_policies', {
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

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
    userId: varchar('user_id', { length: 255 }).notNull(), // Clerk user ID

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
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const baleybotsRelations = relations(baleybots, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [baleybots.workspaceId],
    references: [workspaces.id],
  }),
  executions: many(baleybotExecutions),
  memory: many(baleybotMemory),
  scheduledTasks: many(scheduledTasks),
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

export const baleybotExecutionsRelations = relations(baleybotExecutions, ({ one }) => ({
  baleybot: one(baleybots, {
    fields: [baleybotExecutions.baleybotId],
    references: [baleybots.id],
  }),
}));

export const approvalPatternsRelations = relations(approvalPatterns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [approvalPatterns.workspaceId],
    references: [workspaces.id],
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

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  connections: many(connections),
  tools: many(tools),
  blocks: many(blocks),
  flows: many(flows),
  apiKeys: many(apiKeys),
  baleybots: many(baleybots),
  approvalPatterns: many(approvalPatterns),
  workspacePolicies: one(workspacePolicies),
  baleybotMemory: many(baleybotMemory),
  notifications: many(notifications),
  scheduledTasks: many(scheduledTasks),
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
