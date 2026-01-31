/**
 * Streaming Event Types
 *
 * These types mirror the BaleyBots stream event schema.
 * When BaleyBots updates, we update these to match.
 */

// ============================================================================
// Core Event Types (from BaleyBots)
// ============================================================================

export interface TextDeltaEvent {
  type: 'text_delta';
  content: string;
}

export interface StructuredOutputDeltaEvent {
  type: 'structured_output_delta';
  content: string;
}

export interface ToolCallStreamStartEvent {
  type: 'tool_call_stream_start';
  id: string;
  toolName: string;
}

export interface ToolCallArgumentsDeltaEvent {
  type: 'tool_call_arguments_delta';
  id: string;
  argumentsDelta: string;
}

export interface ToolCallStreamCompleteEvent {
  type: 'tool_call_stream_complete';
  id: string;
  toolName: string;
  arguments: unknown;
}

export interface ToolExecutionStartEvent {
  type: 'tool_execution_start';
  id: string;
  toolName: string;
  arguments: unknown;
}

export interface ToolExecutionOutputEvent {
  type: 'tool_execution_output';
  id: string;
  toolName: string;
  result: unknown;
  error?: string;
}

export interface ToolExecutionStreamEvent {
  type: 'tool_execution_stream';
  toolName: string;
  toolCallId: string;
  childBotName?: string;
  nestedEvent: BaleybotStreamEvent;
}

export interface ToolValidationErrorEvent {
  type: 'tool_validation_error';
  toolName: string;
  validationErrors: unknown;
  receivedArguments: unknown;
}

export interface ReasoningEvent {
  type: 'reasoning';
  content: string;
}

export interface StreamErrorEvent {
  type: 'error';
  error: Error | { message: string; code?: string };
}

export type DoneReason =
  | 'yield'
  | 'out_of_iterations'
  | 'max_tokens_reached'
  | 'error'
  | 'interrupted'
  | 'end_turn'
  | 'tool_use'
  | 'stop_sequence';

export interface DoneEvent {
  type: 'done';
  reason: DoneReason;
  agent_id: string;
  parent_agent_id?: string;
}

// ============================================================================
// Union Type
// ============================================================================

export type BaleybotStreamEvent =
  | TextDeltaEvent
  | StructuredOutputDeltaEvent
  | ToolCallStreamStartEvent
  | ToolCallArgumentsDeltaEvent
  | ToolCallStreamCompleteEvent
  | ToolExecutionStartEvent
  | ToolExecutionOutputEvent
  | ToolExecutionStreamEvent
  | ToolValidationErrorEvent
  | ReasoningEvent
  | StreamErrorEvent
  | DoneEvent;

// ============================================================================
// Type Guards
// ============================================================================

export function isTextDelta(event: BaleybotStreamEvent): event is TextDeltaEvent {
  return event.type === 'text_delta';
}

export function isToolCallStart(event: BaleybotStreamEvent): event is ToolCallStreamStartEvent {
  return event.type === 'tool_call_stream_start';
}

export function isToolCallArgsDelta(event: BaleybotStreamEvent): event is ToolCallArgumentsDeltaEvent {
  return event.type === 'tool_call_arguments_delta';
}

export function isToolCallComplete(event: BaleybotStreamEvent): event is ToolCallStreamCompleteEvent {
  return event.type === 'tool_call_stream_complete';
}

export function isToolExecStart(event: BaleybotStreamEvent): event is ToolExecutionStartEvent {
  return event.type === 'tool_execution_start';
}

export function isToolExecOutput(event: BaleybotStreamEvent): event is ToolExecutionOutputEvent {
  return event.type === 'tool_execution_output';
}

export function isToolExecStream(event: BaleybotStreamEvent): event is ToolExecutionStreamEvent {
  return event.type === 'tool_execution_stream';
}

export function isReasoning(event: BaleybotStreamEvent): event is ReasoningEvent {
  return event.type === 'reasoning';
}

export function isError(event: BaleybotStreamEvent): event is StreamErrorEvent {
  return event.type === 'error';
}

export function isDone(event: BaleybotStreamEvent): event is DoneEvent {
  return event.type === 'done';
}

// ============================================================================
// Server Event Wrapper (what our API returns)
// ============================================================================

export interface ServerStreamEvent {
  botId: string;
  botName: string;
  event: BaleybotStreamEvent;
  timestamp: number;
}
