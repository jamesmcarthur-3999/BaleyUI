'use client';

import { TextBlock } from './TextBlock';
import { ToolCallChip } from './ToolCallChip';
import { ToolCallGroup } from './ToolCallGroup';
import { ThinkingToggle } from './ThinkingToggle';
import { SpawnAgentCard } from './SpawnAgentCard';
import { SequentialThinkingPanel } from './SequentialThinkingPanel';
import { DSLPipelinePanel } from './DSLPipelinePanel';
import { ErrorNotice } from './ErrorNotice';
import { DoneIndicator } from './DoneIndicator';
import { SystemNotice } from './SystemNotice';
import { groupToolSegments, type GroupedSegment } from '../utils/group-tool-blocks';
import type { RenderableSegment, ChatConfig } from '../types';
import type {
  TextSegment,
  ToolCallSegment,
  ReasoningSegment,
  SpawnAgentSegment,
  SequentialThinkingSegment,
  ErrorSegment,
  DoneSegment,
} from '@baleybots/chat';
import type { DSLPipelineSegment } from '@baleybots/core';
import type { SystemBlock } from '../types';

interface SegmentRendererProps {
  segments: RenderableSegment[];
  config: ChatConfig;
}

export function SegmentRenderer({ segments, config }: SegmentRendererProps) {
  // Filter to enabled segment types
  const filtered = segments.filter(s => config.enabledSegments.has(s.type));

  // Group consecutive tool calls if configured
  const grouped: GroupedSegment[] = config.groupConsecutiveTools
    ? groupToolSegments(filtered, config.groupThreshold)
    : filtered;

  return (
    <>
      {grouped.map((segment, i) => {
        switch (segment.type) {
          case 'text':
            return <TextBlock key={segment.id} segment={segment as TextSegment} />;
          case 'tool_call':
            return <ToolCallChip key={segment.id} segment={segment as ToolCallSegment} detail={config.toolDetail} />;
          case 'tool_group':
            return <ToolCallGroup key={`group-${i}`} group={segment} detail={config.toolDetail} />;
          case 'reasoning':
            return <ThinkingToggle key={segment.id} segment={segment as ReasoningSegment} />;
          case 'spawn_agent':
            return <SpawnAgentCard key={segment.id} segment={segment as SpawnAgentSegment} config={config} />;
          case 'sequential_thinking':
            return <SequentialThinkingPanel key={segment.id} segment={segment as SequentialThinkingSegment} />;
          case 'dsl_pipeline':
            return <DSLPipelinePanel key={segment.id} segment={segment as DSLPipelineSegment} config={config} />;
          case 'error':
            return <ErrorNotice key={segment.id} segment={segment as ErrorSegment} />;
          case 'done':
            return <DoneIndicator key={segment.id} segment={segment as DoneSegment} />;
          case 'system':
            return <SystemNotice key={`sys-${i}`} block={segment as SystemBlock} />;
          case 'structured_output':
            return null; // Handled in text flow
          default:
            return null;
        }
      })}
    </>
  );
}
