/**
 * Streaming State Types
 *
 * Types for managing streaming UI state.
 */

// ============================================================================
// Tool Call State
// ============================================================================

export type ToolCallStatus =
  | 'streaming_args'
  | 'args_complete'
  | 'executing'
  | 'complete'
  | 'error';

export interface ToolCallState {
  id: string;
  toolName: string;
  status: ToolCallStatus;
  arguments: string; // Raw accumulated arguments
  parsedArguments?: unknown; // Parsed when complete
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
  // For nested bot streams
  nestedStream?: NestedStreamState;
}

export interface NestedStreamState {
  botName: string;
  text: string;
  isComplete: boolean;
}

// ============================================================================
// Stream Metrics
// ============================================================================

export interface StreamMetrics {
  /** Time to first token in milliseconds */
  ttft: number | null;
  /** Tokens received per second */
  tokensPerSecond: number | null;
  /** Total tokens received */
  totalTokens: number;
  /** Request start time */
  startTime: number | null;
  /** First token time */
  firstTokenTime: number | null;
  /** Completion time */
  endTime: number | null;
}

// ============================================================================
// Overall Stream State
// ============================================================================

export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface StreamState {
  status: StreamStatus;
  /** Accumulated text content */
  text: string;
  /** Accumulated reasoning/thinking content */
  reasoning: string;
  /** Structured JSON output */
  structuredOutput: unknown;
  /** Whether structured output is complete */
  structuredOutputComplete: boolean;
  /** Tool calls with their states */
  toolCalls: ToolCallState[];
  /** Streaming metrics */
  metrics: StreamMetrics;
  /** Error if status is 'error' */
  error: Error | null;
  /** Bot info */
  botId: string | null;
  botName: string | null;
}

// ============================================================================
// Initial State Factory
// ============================================================================

export function createInitialStreamState(): StreamState {
  return {
    status: 'idle',
    text: '',
    reasoning: '',
    structuredOutput: null,
    structuredOutputComplete: false,
    toolCalls: [],
    metrics: {
      ttft: null,
      tokensPerSecond: null,
      totalTokens: 0,
      startTime: null,
      firstTokenTime: null,
      endTime: null,
    },
    error: null,
    botId: null,
    botName: null,
  };
}

export function createInitialMetrics(): StreamMetrics {
  return {
    ttft: null,
    tokensPerSecond: null,
    totalTokens: 0,
    startTime: null,
    firstTokenTime: null,
    endTime: null,
  };
}
