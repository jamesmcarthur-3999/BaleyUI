import { describe, it, expect } from 'vitest';
import { convertBaleybotEvent } from '../adapter';
import type { BaleybotStreamEvent } from '../types';

describe('convertBaleybotEvent', () => {
  it('converts text_delta to text-delta', () => {
    const event: BaleybotStreamEvent = {
      type: 'text_delta',
      content: 'Hello world',
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'text-delta',
      textDelta: 'Hello world',
    });
  });

  it('converts reasoning to reasoning-delta', () => {
    const event: BaleybotStreamEvent = {
      type: 'reasoning',
      content: 'Let me think...',
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'reasoning-delta',
      reasoningDelta: 'Let me think...',
    });
  });

  it('converts tool_call_stream_start to tool-input-start', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_call_stream_start',
      id: 'tool-123',
      toolName: 'searchWeb',
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'tool-input-start',
      toolCallId: 'tool-123',
      toolName: 'searchWeb',
    });
  });

  it('converts tool_call_arguments_delta to tool-input-delta', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_call_arguments_delta',
      id: 'tool-123',
      argumentsDelta: '{"query":',
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'tool-input-delta',
      toolCallId: 'tool-123',
      inputTextDelta: '{"query":',
    });
  });

  it('converts tool_call_stream_complete to tool-input-available', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_call_stream_complete',
      id: 'tool-123',
      toolName: 'searchWeb',
      arguments: { query: 'hello' },
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'tool-input-available',
      toolCallId: 'tool-123',
      toolName: 'searchWeb',
      input: { query: 'hello' },
    });
  });

  it('converts tool_execution_output to tool-output-available', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_execution_output',
      id: 'tool-123',
      toolName: 'searchWeb',
      result: { results: ['a', 'b'] },
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'tool-output-available',
      toolCallId: 'tool-123',
      output: { results: ['a', 'b'] },
    });
  });

  it('converts tool_execution_output with error', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_execution_output',
      id: 'tool-123',
      toolName: 'searchWeb',
      result: null,
      error: 'Network error',
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'tool-output-available',
      toolCallId: 'tool-123',
      output: { error: 'Network error' },
    });
  });

  it('converts done to step-finish', () => {
    const event: BaleybotStreamEvent = {
      type: 'done',
      reason: 'end_turn',
      agent_id: 'agent-1',
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'step-finish',
      finishReason: 'end_turn',
    });
  });

  it('converts error events', () => {
    const event: BaleybotStreamEvent = {
      type: 'error',
      error: { message: 'Something went wrong' },
    };

    expect(convertBaleybotEvent(event)).toEqual({
      type: 'error',
      error: 'Something went wrong',
    });
  });

  it('returns null for tool_execution_start (no AI SDK equivalent)', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_execution_start',
      id: 'tool-123',
      toolName: 'searchWeb',
      arguments: { query: 'hello' },
    };

    expect(convertBaleybotEvent(event)).toBeNull();
  });

  it('converts nested stream events to custom data', () => {
    const event: BaleybotStreamEvent = {
      type: 'tool_execution_stream',
      toolName: 'spawnBot',
      toolCallId: 'tool-123',
      childBotName: 'ChildBot',
      nestedEvent: { type: 'text_delta', content: 'nested text' },
    };

    const result = convertBaleybotEvent(event);
    expect(result?.type).toBe('data');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).data[0].nestedStream).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).data[0].nestedStream.botName).toBe('ChildBot');
  });
});
