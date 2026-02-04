/**
 * Type definitions for execution-related data structures.
 */

/**
 * A segment of an execution trace (e.g., approval decisions, tool calls).
 */
export interface ExecutionSegment {
  type: string;
  toolCallId?: string;
  approved?: boolean;
  denyReason?: string;
  decidedBy?: string;
  decidedAt?: string;
  [key: string]: unknown;
}

/**
 * Input data for an execution.
 */
export interface ExecutionInput {
  prompt?: string;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Output data from an execution.
 */
export interface ExecutionOutput {
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

/**
 * Configuration for connection providers (OpenAI, Anthropic, Ollama).
 */
export interface ConnectionConfig {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  [key: string]: unknown;
}

/**
 * Update data for partial updates with optimistic locking.
 */
export interface PartialUpdateData {
  [key: string]: unknown;
}

/**
 * Block schema definition (input/output schemas).
 */
export interface BlockSchema {
  [key: string]: unknown;
}

/**
 * Router configuration for router blocks.
 */
export interface RouterConfig {
  [key: string]: unknown;
}

/**
 * Loop configuration for loop blocks.
 */
export interface LoopConfig {
  [key: string]: unknown;
}

/**
 * Training data item for JSONL export.
 */
export interface TrainingDataItem {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  reasoning?: string;
}

/**
 * Tool definition reference.
 */
export interface ToolReference {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}
