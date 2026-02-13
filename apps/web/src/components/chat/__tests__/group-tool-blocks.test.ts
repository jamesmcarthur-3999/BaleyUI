import { describe, it, expect } from 'vitest';
import { groupToolSegments, isGroupComplete } from '../utils/group-tool-blocks';
import type { RenderableSegment } from '../types';
import type { TextSegment, ToolCallSegment } from '@baleybots/chat';

const text = (content: string): TextSegment => ({
  type: 'text',
  id: `text-${content}`,
  timestamp: Date.now(),
  content,
  isStreaming: false,
});

const tool = (name: string, status: ToolCallSegment['status'] = 'completed'): ToolCallSegment => ({
  type: 'tool_call',
  id: `tc-${name}`,
  toolCallId: `tc-${name}`,
  timestamp: Date.now(),
  name,
  status,
});

describe('groupToolSegments', () => {
  it('returns empty for empty input', () => {
    expect(groupToolSegments([])).toEqual([]);
  });

  it('passes through text segments unchanged', () => {
    const segments: RenderableSegment[] = [text('hello'), text('world')];
    expect(groupToolSegments(segments)).toEqual(segments);
  });

  it('does not group a single tool call', () => {
    const segments: RenderableSegment[] = [text('before'), tool('web_search'), text('after')];
    const result = groupToolSegments(segments);
    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ type: 'tool_call' });
  });

  it('groups 2+ consecutive tool calls', () => {
    const segments: RenderableSegment[] = [text('before'), tool('web_search'), tool('fetch_url'), text('after')];
    const result = groupToolSegments(segments);
    expect(result).toHaveLength(3);
    const group = result[1];
    expect(group).toMatchObject({ type: 'tool_group' });
    if (group && group.type === 'tool_group') {
      expect(group.tools).toHaveLength(2);
    }
  });

  it('groups 3+ consecutive tool calls at end', () => {
    const segments: RenderableSegment[] = [text('start'), tool('a'), tool('b'), tool('c')];
    const result = groupToolSegments(segments);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ type: 'tool_group' });
  });

  it('respects custom threshold', () => {
    const segments: RenderableSegment[] = [tool('a'), tool('b')];
    // threshold=3 means 2 tools are NOT grouped
    const result = groupToolSegments(segments, 3);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'tool_call' });
  });

  it('creates separate groups split by text', () => {
    const segments: RenderableSegment[] = [tool('a'), tool('b'), text('middle'), tool('c'), tool('d')];
    const result = groupToolSegments(segments);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ type: 'tool_group' });
    expect(result[1]).toMatchObject({ type: 'text' });
    expect(result[2]).toMatchObject({ type: 'tool_group' });
  });
});

describe('isGroupComplete', () => {
  it('returns true when all tools completed', () => {
    expect(isGroupComplete({ type: 'tool_group', tools: [tool('a', 'completed'), tool('b', 'completed')] }))
      .toBe(true);
  });

  it('returns false when any tool still running', () => {
    expect(isGroupComplete({ type: 'tool_group', tools: [tool('a', 'completed'), tool('b', 'running')] }))
      .toBe(false);
  });

  it('treats failed as terminal', () => {
    expect(isGroupComplete({ type: 'tool_group', tools: [tool('a', 'failed')] }))
      .toBe(true);
  });
});
