import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as schema from './schema';

// Select types (for reading)
export type Workspace = InferSelectModel<typeof schema.workspaces>;
export type Connection = InferSelectModel<typeof schema.connections>;
export type Tool = InferSelectModel<typeof schema.tools>;
export type Block = InferSelectModel<typeof schema.blocks>;
export type Flow = InferSelectModel<typeof schema.flows>;
export type FlowExecution = InferSelectModel<typeof schema.flowExecutions>;
export type BlockExecution = InferSelectModel<typeof schema.blockExecutions>;
export type ToolExecution = InferSelectModel<typeof schema.toolExecutions>;
export type Decision = InferSelectModel<typeof schema.decisions>;
export type Pattern = InferSelectModel<typeof schema.patterns>;
export type TestCase = InferSelectModel<typeof schema.testCases>;
export type ExecutionEvent = InferSelectModel<typeof schema.executionEvents>;
export type AuditLog = InferSelectModel<typeof schema.auditLogs>;
export type BackgroundJob = InferSelectModel<typeof schema.backgroundJobs>;
export type BuilderEvent = InferSelectModel<typeof schema.builderEvents>;

// Insert types (for creating)
export type NewWorkspace = InferInsertModel<typeof schema.workspaces>;
export type NewConnection = InferInsertModel<typeof schema.connections>;
export type NewTool = InferInsertModel<typeof schema.tools>;
export type NewBlock = InferInsertModel<typeof schema.blocks>;
export type NewFlow = InferInsertModel<typeof schema.flows>;
export type NewFlowExecution = InferInsertModel<typeof schema.flowExecutions>;
export type NewBlockExecution = InferInsertModel<typeof schema.blockExecutions>;
export type NewToolExecution = InferInsertModel<typeof schema.toolExecutions>;
export type NewDecision = InferInsertModel<typeof schema.decisions>;
export type NewPattern = InferInsertModel<typeof schema.patterns>;
export type NewTestCase = InferInsertModel<typeof schema.testCases>;
export type NewExecutionEvent = InferInsertModel<typeof schema.executionEvents>;
export type NewAuditLog = InferInsertModel<typeof schema.auditLogs>;
export type NewBackgroundJob = InferInsertModel<typeof schema.backgroundJobs>;
export type NewBuilderEvent = InferInsertModel<typeof schema.builderEvents>;

// BaleyBot types
export type ApiKey = InferSelectModel<typeof schema.apiKeys>;
export type WebhookLog = InferSelectModel<typeof schema.webhookLogs>;
export type Baleybot = InferSelectModel<typeof schema.baleybots>;
export type BaleybotExecution = InferSelectModel<typeof schema.baleybotExecutions>;
export type BaleybotTrigger = InferSelectModel<typeof schema.baleybotTriggers>;
export type ApprovalPattern = InferSelectModel<typeof schema.approvalPatterns>;
export type WorkspacePolicy = InferSelectModel<typeof schema.workspacePolicies>;
export type BaleybotMemory = InferSelectModel<typeof schema.baleybotMemory>;
export type BaleybotSharedStorage = InferSelectModel<typeof schema.baleybotSharedStorage>;
export type Notification = InferSelectModel<typeof schema.notifications>;
export type ScheduledTask = InferSelectModel<typeof schema.scheduledTasks>;
export type BaleybotMetric = InferSelectModel<typeof schema.baleybotMetrics>;
export type BaleybotMetricAggregate = InferSelectModel<typeof schema.baleybotMetricAggregates>;
export type BaleybotUsage = InferSelectModel<typeof schema.baleybotUsage>;
export type BaleybotAlert = InferSelectModel<typeof schema.baleybotAlerts>;

export type NewApiKey = InferInsertModel<typeof schema.apiKeys>;
export type NewWebhookLog = InferInsertModel<typeof schema.webhookLogs>;
export type NewBaleybot = InferInsertModel<typeof schema.baleybots>;
export type NewBaleybotExecution = InferInsertModel<typeof schema.baleybotExecutions>;
export type NewBaleybotTrigger = InferInsertModel<typeof schema.baleybotTriggers>;
export type NewApprovalPattern = InferInsertModel<typeof schema.approvalPatterns>;
export type NewWorkspacePolicy = InferInsertModel<typeof schema.workspacePolicies>;
export type NewBaleybotMemory = InferInsertModel<typeof schema.baleybotMemory>;
export type NewBaleybotSharedStorage = InferInsertModel<typeof schema.baleybotSharedStorage>;
export type NewNotification = InferInsertModel<typeof schema.notifications>;
export type NewScheduledTask = InferInsertModel<typeof schema.scheduledTasks>;
export type NewBaleybotMetric = InferInsertModel<typeof schema.baleybotMetrics>;
export type NewBaleybotMetricAggregate = InferInsertModel<typeof schema.baleybotMetricAggregates>;
export type NewBaleybotUsage = InferInsertModel<typeof schema.baleybotUsage>;
export type NewBaleybotAlert = InferInsertModel<typeof schema.baleybotAlerts>;

// Database type for dependency injection
export type Database = typeof import('./index').db;

// Block types
export type BlockType =
  | 'ai'
  | 'function'
  | 'router'
  | 'pipeline'
  | 'loop'
  | 'parallel';

// Connection types
export type ConnectionType =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'postgres'
  | 'mysql'
  | 'mongodb';

// Connection status
export type ConnectionStatus = 'connected' | 'error' | 'unconfigured';

// Execution status (prefer 'completed'; 'complete' accepted for legacy block_executions data)
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'stale';

// Tool approval status
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'modified';

// Job status
export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Audit action
export type AuditAction = 'create' | 'update' | 'delete' | 'restore';
