/**
 * Streaming Event Types
 *
 * Re-exports from @baleybots/core - the single source of truth.
 * BaleyUI-specific wrapper types are defined here.
 */

// Re-export all event types from @baleybots/core
export type { BaleybotStreamEvent, DoneReason, DoneEvent } from '@baleybots/core';

// Import for type guards
import type { BaleybotStreamEvent } from '@baleybots/core';

// ============================================================================
// Type Guards
// ============================================================================

export function isTextDelta(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'text_delta' }> {
  return event.type === 'text_delta';
}

export function isToolCallStart(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_call_stream_start' }> {
  return event.type === 'tool_call_stream_start';
}

export function isToolCallArgsDelta(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_call_arguments_delta' }> {
  return event.type === 'tool_call_arguments_delta';
}

export function isToolCallComplete(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_call_stream_complete' }> {
  return event.type === 'tool_call_stream_complete';
}

export function isToolExecStart(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_execution_start' }> {
  return event.type === 'tool_execution_start';
}

export function isToolExecOutput(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_execution_output' }> {
  return event.type === 'tool_execution_output';
}

export function isToolExecStream(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_execution_stream' }> {
  return event.type === 'tool_execution_stream';
}

// NEW type guards for events that were missing from old BaleyUI
export function isToolCallStreamDelta(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_call_stream_delta' }> {
  return event.type === 'tool_call_stream_delta';
}

export function isToolCallStreamOutput(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_call_stream_output' }> {
  return event.type === 'tool_call_stream_output';
}

export function isToolCallStreamError(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_call_stream_error' }> {
  return event.type === 'tool_call_stream_error';
}

export function isStructuredOutputDelta(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'structured_output_delta' }> {
  return event.type === 'structured_output_delta';
}

export function isReasoning(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'reasoning' }> {
  return event.type === 'reasoning';
}

export function isToolValidationError(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'tool_validation_error' }> {
  return event.type === 'tool_validation_error';
}

export function isError(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'error' }> {
  return event.type === 'error';
}

export function isDone(
  event: BaleybotStreamEvent
): event is Extract<BaleybotStreamEvent, { type: 'done' }> {
  return event.type === 'done';
}

// ============================================================================
// Server Event Wrapper (BaleyUI-specific)
// ============================================================================

export interface ServerStreamEvent {
  botId: string;
  botName: string;
  event: BaleybotStreamEvent;
  timestamp: number;
}
