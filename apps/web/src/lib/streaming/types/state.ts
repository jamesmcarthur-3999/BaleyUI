/**
 * Streaming State Types
 *
 * MIGRATION NOTE: The canonical streaming representation is now SDK's
 * StreamSegmentState from @baleybots/chat, used via AppStreamState in
 * useStreamState.ts. These types remain for backward compatibility with
 * existing consumers (ToolCallCard, ChatInterface, AdaptiveTestSurface, etc.)
 *
 * New code should use:
 *   - AppStreamState from '@/hooks/useStreamState' (app-level state)
 *   - StreamSegmentState from '@baleybots/chat' (SDK segment state)
 *   - ToolCallSegment from '@baleybots/chat' (instead of ToolCallState)
 *
 * @deprecated Prefer SDK types from @baleybots/chat for new features.
 */

import type { StreamSegment, ToolCallSegment } from '@baleybots/chat';

// ============================================================================
// Tool Call State (backward-compat)
// ============================================================================

/** @deprecated Use ToolCallSegment['status'] from @baleybots/chat instead */
export type ToolCallStatus =
  | 'streaming_args'
  | 'args_complete'
  | 'executing'
  | 'complete'
  | 'error';

/** @deprecated Use ToolCallSegment from @baleybots/chat instead */
export interface ToolCallState {
  id: string;
  toolName: string;
  status: ToolCallStatus;
  arguments: string;
  parsedArguments?: unknown;
  result?: unknown;
  error?: string;
  startTime: number;
  endTime?: number;
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
  ttft: number | null;
  tokensPerSecond: number | null;
  totalTokens: number;
  startTime: number | null;
  firstTokenTime: number | null;
  endTime: number | null;
}

// ============================================================================
// Overall Stream State (backward-compat)
// ============================================================================

/** @deprecated Use AppStreamStatus from '@/hooks/useStreamState' instead */
export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'complete'
  | 'error'
  | 'cancelled';

/** @deprecated Use AppStreamState from '@/hooks/useStreamState' instead */
export interface StreamState {
  status: StreamStatus;
  text: string;
  reasoning: string;
  structuredOutput: unknown;
  structuredOutputComplete: boolean;
  toolCalls: ToolCallState[];
  metrics: StreamMetrics;
  error: Error | null;
  botId: string | null;
  botName: string | null;
}

// ============================================================================
// Initial State Factory (backward-compat)
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

// ============================================================================
// SDK ↔ Legacy Adapters
// ============================================================================

/**
 * Convert SDK ToolCallSegment status to legacy ToolCallStatus.
 * For backward compatibility with components that haven't migrated yet.
 */
export function toOldToolCallStatus(status: ToolCallSegment['status']): ToolCallStatus {
  switch (status) {
    case 'running': return 'executing';
    case 'completed': return 'complete';
    case 'failed': return 'error';
  }
}

/**
 * Extract legacy ToolCallState[] from SDK segments.
 * For backward compatibility with components that expect ToolCallState.
 */
export function getToolCallStates(segments: StreamSegment[]): ToolCallState[] {
  return segments
    .filter((s): s is ToolCallSegment => s.type === 'tool_call')
    .map(seg => ({
      id: seg.toolCallId,
      toolName: seg.name,
      status: toOldToolCallStatus(seg.status),
      arguments: seg.rawArgs ?? (seg.args ? JSON.stringify(seg.args) : ''),
      parsedArguments: seg.args,
      result: seg.result,
      error: seg.error,
      startTime: seg.timestamp,
      endTime: seg.status !== 'running' ? seg.timestamp : undefined,
    }));
}
