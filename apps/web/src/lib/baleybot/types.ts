/**
 * Type definitions for BAL-first BaleyBot architecture
 */

import type { BaleybotStreamEvent } from '@baleybots/core';

// ============================================================================
// WORKSPACE POLICIES
// ============================================================================

/**
 * Workspace-level policies for tool governance
 */
export interface WorkspacePolicies {
  /** Tools that are explicitly allowed (overrides dangerous defaults) */
  allowedTools: string[] | null;
  /** Tools that are forbidden */
  forbiddenTools: string[] | null;
  /** Tools that require approval before execution */
  requiresApprovalTools: string[] | null;
  /** Maximum amount for auto-approved financial operations */
  maxAutoApproveAmount: number | null;
  /** Days before reapproval is required for patterns */
  reapprovalIntervalDays: number;
  /** Number of auto-approvals before review is triggered */
  maxAutoFiresBeforeReview: number;
  /** Natural language guidelines for AI pattern learning */
  learningManual: string | null;
}

// ============================================================================
// BALEYBOT TYPES
// ============================================================================

/**
 * Status of a BaleyBot
 */
export type BaleybotStatus = 'draft' | 'active' | 'paused' | 'error';

/**
 * Lifecycle stage for Build -> Launch Prep -> Live UX.
 */
export type BaleybotLifecycleStage = 'draft' | 'verified' | 'launch_prepared' | 'live' | 'paused';

/**
 * Runtime interface specification used by Live mode.
 */
export interface RuntimeInterfaceSpec {
  version: 1;
  mode: 'chat' | 'form' | 'hybrid' | 'file' | 'webhook';
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  components: Array<
    | { type: 'chat_input'; id: string; label: string; placeholder?: string }
    | { type: 'json_form'; id: string; label: string; schema?: Record<string, unknown>; samplePayload?: Record<string, unknown> }
    | { type: 'file_input'; id: string; label: string; accept?: string[]; maxSizeMb?: number }
    | { type: 'run_button'; id: string; label: string }
    | { type: 'result_view'; id: string; format: 'text' | 'json' | 'table' | 'mixed' }
    | { type: 'cluster_trace'; id: string; showEntityTiming: boolean }
    | { type: 'webhook_simulator'; id: string; label: string; samplePayload?: Record<string, unknown> }
    | { type: 'url_input'; id: string; label: string; placeholder?: string }
    | { type: 'context_setup'; id: string; label: string; fields: Array<{ key: string; label: string; type: 'text' | 'number' | 'json' }> }
  >;
  testSuggestions?: string[];
  rationale?: string;
}

/**
 * Launch preparation artifact generated before going live.
 */
export interface LaunchKit {
  generatedAt: string;
  confidenceScore: number;
  verificationSummary: {
    passRate: number;
    topology: 'single' | 'chain' | 'parallel' | 'complex';
    keyRisks: string[];
  };
  activationPlan: {
    recommendedPrimary: TriggerType;
    channels: Array<{
      type: TriggerType;
      enabledByDefault: boolean;
      config: Record<string, unknown>;
      rationale: string;
    }>;
  };
  runtimeInterface: RuntimeInterfaceSpec;
  monitoringPlan: {
    alerts: string[];
    metrics: string[];
  };
  goLiveChecklist: string[];
}

/**
 * A BaleyBot definition from the database
 */
export interface Baleybot {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: BaleybotStatus;
  lifecycleStage: BaleybotLifecycleStage;
  balCode: string;
  structure: Record<string, unknown> | null;
  entityNames: string[] | null;
  dependencies: string[] | null;
  launchKit: LaunchKit | null;
  runtimeInterfaceSpec: RuntimeInterfaceSpec | null;
  launchPreparedAt: Date | null;
  liveAt: Date | null;
  pausedAt: Date | null;
  executionCount: number;
  lastExecutedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

/**
 * Summary of a BaleyBot for display purposes
 */
export interface BaleybotSummary {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: BaleybotStatus;
  executionCount: number;
  lastExecutedAt: Date | null;
}

// ============================================================================
// BAL GENERATION TYPES
// ============================================================================

/**
 * Context for BAL generation
 */
export interface GeneratorContext {
  workspaceId: string;
  availableTools: ToolDefinition[];
  workspacePolicies: WorkspacePolicies | null;
  connections: Connection[];
  existingBaleybots: BaleybotSummary[];
}

// ============================================================================
// TOOL ENRICHMENT TYPES
// ============================================================================

/**
 * What a tool requires to function (e.g. a connection, API key, config, permission).
 * Resolved at catalog assembly time — `satisfied` and `connectionId` are populated then.
 */
export interface ToolRequirement {
  type: 'connection' | 'api_key' | 'config' | 'permission';
  connectionType?: string;               // e.g., 'postgres', 'slack', 'openai'
  description: string;                   // Human-readable: "PostgreSQL database connection"
  satisfied?: boolean;                   // Resolved at catalog assembly time
  connectionId?: string;                 // Which connection satisfies this (if any)
}

/**
 * Where a tool came from — discriminated union for source tracking.
 */
export type ToolSource =
  | { kind: 'built-in' }
  | { kind: 'connection'; connectionId: string; connectionName: string; connectionType: string }
  | { kind: 'mcp'; connectionId: string }
  | { kind: 'workspace'; toolId: string }
  | { kind: 'ephemeral'; createdBy: string };

/**
 * Usage example for a tool, shown in AI context and tool browser.
 */
export interface ToolExample {
  input: Record<string, unknown>;
  description: string;
}

/**
 * Tool definition with enriched metadata.
 *
 * The base fields (name, description, inputSchema) are required.
 * Enrichment fields (requirements, tags, source, etc.) are optional and populated
 * progressively — built-in tools get them from BUILT_IN_TOOLS_METADATA, connection-derived
 * tools get them at generation time, and workspace tools may have minimal metadata.
 *
 * The `source` field tracks provenance. The `healthStatus` field is resolved at catalog
 * assembly time by checking whether all `requirements` are satisfied.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: string;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
  capabilities?: string[];

  // Enrichment fields (Phase 1)
  /** SDK-aligned capability: read, write, or both */
  capability?: 'read' | 'write' | 'both';
  /** What this tool needs to work */
  requirements?: ToolRequirement[];
  /** Searchable tags for discovery: ['database', 'read', 'sql'] */
  tags?: string[];
  /** Usage examples for AI context and tool browser */
  examples?: ToolExample[];
  /** Where the tool came from */
  source?: ToolSource;
  /** If derived from a connection */
  connectionId?: string;
  /** Resolved at catalog assembly time based on requirements satisfaction */
  healthStatus?: 'ready' | 'needs-setup' | 'error' | 'unknown';
  /** How to make this tool work (shown when healthStatus is 'needs-setup') */
  setupInstructions?: string;
}

/**
 * Connection definition (LLM providers, databases, etc.)
 */
export interface Connection {
  id: string;
  type: string;
  name: string;
  status: string;
  isDefault: boolean;
  /** Cached database schema or AI model list (from the connections table availableModels JSONB) */
  availableModels?: unknown;
}

/**
 * Trigger configuration for a BaleyBot
 */
export interface TriggerConfig {
  /** Type of trigger */
  type: TriggerType;
  /** Cron expression for schedule triggers (e.g., "0 9 * * *") */
  schedule?: string;
  /** Source BB ID for bb_completion triggers */
  sourceBaleybotId?: string;
  /** Trigger on success, failure, or any completion */
  completionType?: 'success' | 'failure' | 'completion';
  /** Webhook path for webhook triggers */
  webhookPath?: string;
  /** Database connection ID for db_event triggers */
  dbConnectionId?: string;
  /** Database table name for db_event triggers */
  dbTable?: string;
  /** Database event type for db_event triggers */
  dbEvent?: 'insert' | 'update' | 'delete' | 'change';
  /** MCP server name for mcp_event triggers */
  mcpServer?: string;
  /** MCP tool identifier for mcp_event triggers */
  mcpTool?: string;
  /** MCP resource identifier for mcp_event triggers */
  mcpResource?: string;
  /** Allowed MIME types for file_upload triggers */
  acceptedMimeTypes?: string[];
  /** Max file size in MB for file_upload triggers */
  maxFileSizeMb?: number;
  /** Whether multiple files are accepted */
  multiple?: boolean;
  /** How files are passed into execution input */
  payloadMode?: 'metadata' | 'inline_base64';
  /** Whether the trigger is enabled */
  enabled?: boolean;
}

/**
 * Entity within a generated BAL
 */
export interface GeneratedEntity {
  name: string;
  goal: string;
  model?: string;
  tools: string[];
  canRequest: string[];
  output?: Record<string, string>;
  history?: 'none' | 'inherit';
  /** Trigger configuration for this entity */
  trigger?: TriggerConfig;
}

/**
 * Result of BAL generation
 */
export interface GenerateResult {
  /** The generated BAL code */
  balCode: string;
  /** Human-readable explanation of what the BB does */
  explanation: string;
  /** Entities defined in the BAL */
  entities: GeneratedEntity[];
  /** Rationale for tool assignments */
  toolRationale: Record<string, string>;
  /** Suggested name for the BB */
  suggestedName: string;
  /** Suggested icon (emoji or icon name) */
  suggestedIcon: string;
}

/**
 * Message in the generation conversation
 */
export interface GenerationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ============================================================================
// EXECUTION TYPES
// ============================================================================

/**
 * Status of a BaleyBot execution
 */
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Trigger type for an execution
 */
export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'other_bb' | 'db_event' | 'mcp_event' | 'file_upload';

export const TRIGGER_CORE_TYPES: TriggerType[] = ['manual', 'schedule', 'webhook', 'file_upload'];
export const TRIGGER_ADVANCED_TYPES: TriggerType[] = ['other_bb', 'db_event', 'mcp_event'];

export interface TriggerNormalizationResult {
  normalized: TriggerConfig | null;
  issues: string[];
  valid: boolean;
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMimeTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mimeTypes = value
    .map((entry) => trimOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return mimeTypes.length > 0 ? mimeTypes : undefined;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value > 0 ? value : undefined;
}

function sanitizeCronExpression(value: unknown): string | undefined {
  const schedule = trimOptionalString(value);
  if (!schedule) return undefined;
  return schedule.replace(/\s+/g, ' ');
}

function isValidCronExpression(schedule: string): boolean {
  return schedule.trim().split(/\s+/).length === 5;
}

/**
 * One-way normalization for trigger configs used by wizard UI + persistence layer.
 * Manual trigger is represented as `null` to keep storage simple.
 */
export function normalizeTriggerConfig(input: unknown): TriggerConfig | null {
  if (!input || typeof input !== 'object') return null;

  const raw = input as Partial<TriggerConfig>;
  const type = raw.type;
  if (!type || type === 'manual') return null;

  const enabled = raw.enabled ?? true;

  if (type === 'schedule') {
    return {
      type,
      enabled,
      schedule: sanitizeCronExpression(raw.schedule) ?? '0 9 * * *',
    };
  }

  if (type === 'webhook') {
    const webhookPath = trimOptionalString(raw.webhookPath);
    return {
      type,
      enabled,
      ...(webhookPath ? { webhookPath } : {}),
    };
  }

  if (type === 'file_upload') {
    return {
      type,
      enabled,
      acceptedMimeTypes:
        normalizeMimeTypes(raw.acceptedMimeTypes) ?? [
          'application/pdf',
          'image/png',
          'image/jpeg',
        ],
      maxFileSizeMb: normalizePositiveNumber(raw.maxFileSizeMb) ?? 10,
      multiple: typeof raw.multiple === 'boolean' ? raw.multiple : false,
      payloadMode: raw.payloadMode === 'inline_base64' ? 'inline_base64' : 'metadata',
    };
  }

  if (type === 'other_bb') {
    return {
      type,
      enabled,
      sourceBaleybotId: trimOptionalString(raw.sourceBaleybotId),
      completionType:
        raw.completionType === 'success' ||
        raw.completionType === 'failure' ||
        raw.completionType === 'completion'
          ? raw.completionType
          : 'completion',
    };
  }

  if (type === 'db_event') {
    return {
      type,
      enabled,
      dbConnectionId: trimOptionalString(raw.dbConnectionId),
      dbTable: trimOptionalString(raw.dbTable),
      dbEvent:
        raw.dbEvent === 'insert' ||
        raw.dbEvent === 'update' ||
        raw.dbEvent === 'delete' ||
        raw.dbEvent === 'change'
          ? raw.dbEvent
          : 'insert',
    };
  }

  if (type === 'mcp_event') {
    return {
      type,
      enabled,
      mcpServer: trimOptionalString(raw.mcpServer),
      mcpTool: trimOptionalString(raw.mcpTool),
      mcpResource: trimOptionalString(raw.mcpResource),
    };
  }

  return null;
}

export function validateAndNormalizeTriggerConfig(input: unknown): TriggerNormalizationResult {
  const normalized = normalizeTriggerConfig(input);
  if (!normalized) {
    return { normalized: null, issues: [], valid: true };
  }

  const issues: string[] = [];

  if (normalized.type === 'schedule') {
    if (!normalized.schedule || !isValidCronExpression(normalized.schedule)) {
      issues.push('Schedule must be a valid 5-part cron expression.');
    }
  }

  if (normalized.type === 'webhook' && normalized.webhookPath) {
    if (!normalized.webhookPath.startsWith('/')) {
      issues.push('Webhook path must start with "/".');
    }
  }

  if (normalized.type === 'other_bb') {
    if (!normalized.sourceBaleybotId) {
      issues.push('Choose the source bot that should trigger this bot.');
    }
  }

  if (normalized.type === 'db_event') {
    if (!normalized.dbConnectionId) {
      issues.push('Select a database connection for DB event trigger.');
    }
    if (!normalized.dbTable) {
      issues.push('Enter the database table/collection to watch.');
    }
  }

  if (normalized.type === 'mcp_event') {
    if (!normalized.mcpServer) {
      issues.push('Enter the MCP server that should emit this trigger.');
    }
  }

  if (normalized.type === 'file_upload') {
    if (!normalized.acceptedMimeTypes || normalized.acceptedMimeTypes.length === 0) {
      issues.push('At least one accepted file type is required.');
    } else if (normalized.acceptedMimeTypes.some((type) => !type.includes('/'))) {
      issues.push('Accepted file types must use MIME format like "image/png".');
    }
    if (!normalized.maxFileSizeMb || normalized.maxFileSizeMb <= 0) {
      issues.push('Max file size must be greater than 0MB.');
    }
  }

  return {
    normalized,
    issues,
    valid: issues.length === 0,
  };
}

/**
 * A BaleyBot execution record
 */
export interface BaleybotExecution {
  id: string;
  baleybotId: string;
  status: ExecutionStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  segments: BaleybotStreamEvent[] | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  tokenCount: number | null;
  triggeredBy: TriggerType;
  triggerSource: string | null;
  createdAt: Date;
}

/**
 * Options for executing a BaleyBot
 */
export interface ExecuteOptions {
  /** Callback for streaming segments */
  onSegment?: (segment: BaleybotStreamEvent) => void;
  /** Callback for approval requests */
  onApprovalNeeded?: (request: ApprovalRequest) => Promise<ApprovalResponse>;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Schema validation issue
 */
export interface SchemaValidationIssue {
  /** Path to the invalid field */
  path: PropertyKey[];
  /** Error message */
  message: string;
  /** Error code (from Zod) */
  code: string;
}

/**
 * Result of schema validation
 */
export interface SchemaValidationResult {
  /** Whether the output matches the declared schema */
  valid: boolean;
  /** Validation issues (if any) */
  issues: SchemaValidationIssue[];
}

/**
 * Result of a BaleyBot execution
 */
export interface ExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  output: unknown;
  error?: string;
  segments: BaleybotStreamEvent[];
  durationMs: number;
  tokenCount?: number;
  /** Model used for execution (e.g. "openai:gpt-4o") */
  model?: string;
  /** Input tokens consumed */
  tokensInput?: number;
  /** Output tokens consumed */
  tokensOutput?: number;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Schema validation result (if entity has output schema) */
  schemaValidation?: SchemaValidationResult;
  /** Number of LLM API calls (including tool-use loops) */
  apiCalls?: number;
  /** Total number of tool invocations across all entities */
  toolCallCount?: number;
}

// ============================================================================
// APPROVAL TYPES
// ============================================================================

/**
 * Trust level for approval patterns
 */
export type TrustLevel = 'provisional' | 'trusted' | 'permanent';

/**
 * A learned approval pattern
 */
export interface ApprovalPattern {
  id: string;
  workspaceId: string;
  tool: string;
  actionPattern: Record<string, unknown>;
  entityGoalPattern: string | null;
  trustLevel: TrustLevel;
  timesUsed: number;
  approvedBy: string | null;
  approvedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

/**
 * Request for tool approval
 */
export interface ApprovalRequest {
  /** The tool being called */
  tool: string;
  /** Arguments to the tool */
  arguments: Record<string, unknown>;
  /** The entity making the request */
  entityName: string;
  /** The goal of the entity */
  entityGoal: string;
  /** AI's explanation for why this tool is needed */
  reason: string;
}

/**
 * Response to an approval request
 */
export interface ApprovalResponse {
  /** Whether the request was approved */
  approved: boolean;
  /** Reason for denial (if not approved) */
  reason?: string;
  /** Modified arguments (if approved with changes) */
  modifiedArguments?: Record<string, unknown>;
  /** Whether to remember this decision as a pattern */
  remember?: boolean;
  /** Pattern description if remembering */
  patternDescription?: string;
}

/**
 * Result of checking approval patterns
 */
export interface ApprovalCheckResult {
  /** Whether the action is auto-approved */
  approved: boolean;
  /** ID of the matching pattern (if approved) */
  patternId?: string;
  /** Whether user prompt is needed */
  needsPrompt: boolean;
}

// ============================================================================
// REVIEW TYPES
// ============================================================================

/**
 * Issue found during review
 */
export interface ReviewIssue {
  type: 'incomplete' | 'inaccurate' | 'missing' | 'format' | 'other';
  description: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Suggestion from the review agent
 */
export interface ReviewSuggestion {
  /** Description of the change */
  change: string;
  /** Why this change is recommended */
  reason: string;
  /** BAL diff (if applicable) */
  balDiff?: string;
}

/**
 * Result of reviewing an execution
 */
export interface ReviewResult {
  /** Whether the output meets the original intent */
  meetsIntent: boolean;
  /** Quality score (0-100) */
  qualityScore: number;
  /** Issues found */
  issues: ReviewIssue[];
  /** Suggested improvements */
  suggestions: ReviewSuggestion[];
}

// ============================================================================
// STREAMING SEGMENT TYPES (re-exported for convenience)
// ============================================================================

export type { BaleybotStreamEvent } from '@baleybots/core';
