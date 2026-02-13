/**
 * Tool Segment Grouping
 *
 * Groups consecutive tool_call segments for collapsed display.
 * When 2+ tool calls appear without other segments between them, they're
 * wrapped in a "group" marker so the UI can render them as a
 * collapsible "Used N tools" section.
 *
 * spawn_agent and dsl_pipeline segments are NOT grouped — they have
 * their own rich UI.
 *
 * Input:  [text, tool, tool, tool, text, tool]
 * Output: [text, { group: [tool, tool, tool] }, text, tool]
 *                 ^^^ grouped (3 consecutive)        ^^^ single (not grouped)
 */

import type { ToolCallSegment } from '@baleybots/chat';
import type { RenderableSegment } from '../types';

export interface ToolGroup {
  type: 'tool_group';
  tools: ToolCallSegment[];
}

export type GroupedSegment = RenderableSegment | ToolGroup;

/**
 * Process segments into grouped segments, grouping consecutive tool_call segments.
 *
 * @param segments - Ordered renderable segments
 * @param threshold - Minimum consecutive tools to trigger grouping (default: 2)
 */
export function groupToolSegments(segments: RenderableSegment[], threshold = 2): GroupedSegment[] {
  const result: GroupedSegment[] = [];
  let toolBuffer: ToolCallSegment[] = [];

  const flushToolBuffer = () => {
    if (toolBuffer.length === 0) return;
    if (toolBuffer.length >= threshold) {
      result.push({ type: 'tool_group', tools: [...toolBuffer] });
    } else {
      for (const tool of toolBuffer) {
        result.push(tool);
      }
    }
    toolBuffer = [];
  };

  for (const segment of segments) {
    if (segment.type === 'tool_call') {
      toolBuffer.push(segment as ToolCallSegment);
    } else {
      flushToolBuffer();
      result.push(segment);
    }
  }

  flushToolBuffer();
  return result;
}

/**
 * Check if all tools in a group are complete.
 */
export function isGroupComplete(group: ToolGroup): boolean {
  return group.tools.every(t => t.status === 'completed' || t.status === 'failed');
}
