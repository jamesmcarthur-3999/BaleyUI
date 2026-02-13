import { describe, it, expect } from 'vitest';
import { deriveSegments, textToSegments } from '../utils/derive-segments';
import { createInitialState } from '@baleybots/chat';
import type { StreamSegmentState, StreamSegment, TextSegment, ToolCallSegment, ReasoningSegment } from '@baleybots/chat';

function makeState(segments: StreamSegment[], overrides?: Partial<StreamSegmentState>): StreamSegmentState {
  return {
    ...createInitialState(),
    segments,
    ...overrides,
  };
}

const textSeg = (content: string, isStreaming = false): TextSegment => ({
  type: 'text',
  id: `text-${Date.now()}`,
  timestamp: Date.now(),
  content,
  isStreaming,
});

const reasoningSeg = (content: string): ReasoningSegment => ({
  type: 'reasoning',
  id: `reasoning-${Date.now()}`,
  timestamp: Date.now(),
  content,
  isStreaming: false,
});

const toolSeg = (name: string, status: ToolCallSegment['status'] = 'completed'): ToolCallSegment => ({
  type: 'tool_call',
  id: `tc-${name}`,
  toolCallId: `tc-${name}`,
  timestamp: Date.now(),
  name,
  status,
});

describe('deriveSegments', () => {
  it('returns empty for initial state', () => {
    expect(deriveSegments(createInitialState())).toEqual([]);
  });

  it('returns segments in order', () => {
    const segments: StreamSegment[] = [
      reasoningSeg('Let me think...'),
      textSeg('Hello world'),
      toolSeg('web_search'),
    ];
    const result = deriveSegments(makeState(segments));
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('reasoning');
    expect(result[1]!.type).toBe('text');
    expect(result[2]!.type).toBe('tool_call');
  });

  it('appends system blocks after segments', () => {
    const segments: StreamSegment[] = [textSeg('Hello')];
    const result = deriveSegments(makeState(segments), [
      { type: 'system', action: 'Connected', status: 'success' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('text');
    expect(result[1]!.type).toBe('system');
  });

  it('handles empty system blocks array', () => {
    const segments: StreamSegment[] = [textSeg('Hello')];
    const result = deriveSegments(makeState(segments), []);
    expect(result).toHaveLength(1);
  });

  it('preserves segment data integrity', () => {
    const tool = toolSeg('web_search', 'completed');
    tool.args = { query: 'test' };
    tool.result = [{ title: 'Result' }];
    const result = deriveSegments(makeState([tool]));
    expect(result).toHaveLength(1);
    const toolResult = result[0] as ToolCallSegment;
    expect(toolResult.name).toBe('web_search');
    expect(toolResult.args).toEqual({ query: 'test' });
    expect(toolResult.result).toEqual([{ title: 'Result' }]);
  });
});

describe('textToSegments', () => {
  it('returns empty for empty string', () => {
    expect(textToSegments('')).toEqual([]);
  });

  it('wraps text in a TextSegment', () => {
    const result = textToSegments('hello');
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('text');
    expect((result[0] as TextSegment).content).toBe('hello');
    expect((result[0] as TextSegment).isStreaming).toBe(false);
  });
});
