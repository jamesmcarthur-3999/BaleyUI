// Types
export type { ChatMessage, ChatConfig, SystemBlock, RenderableSegment } from './types';
export { CREATOR_CONFIG, COMPANION_CONFIG } from './types';

// Components
export { ChatThread } from './ChatThread';
export { ChatBubble } from './ChatBubble';
export { SegmentRenderer } from './blocks/SegmentRenderer';
export { ToolCallChip } from './blocks/ToolCallChip';
export { ToolCallGroup } from './blocks/ToolCallGroup';
export { ThinkingToggle } from './blocks/ThinkingToggle';
export { SpawnAgentCard } from './blocks/SpawnAgentCard';
export { SequentialThinkingPanel } from './blocks/SequentialThinkingPanel';
export { DSLPipelinePanel } from './blocks/DSLPipelinePanel';
export { ErrorNotice } from './blocks/ErrorNotice';
export { DoneIndicator } from './blocks/DoneIndicator';
export { SystemNotice } from './blocks/SystemNotice';
export { TextBlock } from './blocks/TextBlock';

// Utilities
export { getToolLabel, getToolIcon, registerToolSummary } from './tool-summaries';
export { deriveSegments, textToSegments } from './utils/derive-segments';
export { groupToolSegments } from './utils/group-tool-blocks';

// Re-export SDK types consumers need
export type {
  StreamSegment,
  ToolCallSegment,
  TextSegment,
  ReasoningSegment,
  SpawnAgentSegment,
  SequentialThinkingSegment,
  ErrorSegment,
  DoneSegment,
  StreamSegmentState,
} from '@baleybots/chat';
export {
  reduceStreamEvent,
  createInitialState,
  finalizeSegments,
  getTextContent,
} from '@baleybots/chat';
