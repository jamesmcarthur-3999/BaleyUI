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
 * A BaleyBot definition from the database
 */
export interface Baleybot {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: BaleybotStatus;
  balCode: string;
  structure: Record<string, unknown> | null;
  entityNames: string[] | null;
  dependencies: string[] | null;
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

/**
 * Tool definition for the generator
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: string;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
  capabilities?: string[];
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
export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'other_bb';

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
  /** Schema validation result (if entity has output schema) */
  schemaValidation?: SchemaValidationResult;
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
